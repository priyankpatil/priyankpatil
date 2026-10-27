-- Run once as the database owner. No raw edits, usernames or article bodies.
-- Roles receive function access only; schema is not exposed through PostgREST.
begin;
create schema if not exists wiki_stream;
revoke all on schema wiki_stream from public;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='wikistream_pipeline') then create role wikistream_pipeline login; end if;
  if not exists(select 1 from pg_roles where rolname='wikistream_reader') then create role wikistream_reader login; end if;
end $$;
grant usage on schema wiki_stream to wikistream_pipeline, wikistream_reader;

create table wiki_stream.settings (
  id boolean primary key default true check(id),
  enabled boolean not null default true,
  schema_limit_bytes bigint not null default 31457280,
  database_limit_bytes bigint not null default 419430400,
  read_budget_bytes bigint not null default 536870912
);
insert into wiki_stream.settings(id) values(true);
create table wiki_stream.sink_state (
  id boolean primary key default true check(id),
  revision integer not null default 0,
  payload jsonb not null check(octet_length(payload::text)<=196608)
) with (autovacuum_vacuum_scale_factor=0.01,autovacuum_vacuum_threshold=10,
        toast.autovacuum_vacuum_scale_factor=0.01,toast.autovacuum_vacuum_threshold=10);
create table wiki_stream.source_checkpoint (
  id boolean primary key default true check(id),
  event_id text not null check(octet_length(event_id)<=16384)
);
create table wiki_stream.frames (
  slot integer primary key check(slot between 0 and 119),
  at timestamptz not null,
  payload jsonb not null check(octet_length(payload::text)<=6144)
) with (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=50);
-- JSONB's text representation inserts spaces; wire frames are capped at 4 KiB by the worker.
create table wiki_stream.minutes (
  slot integer primary key check(slot between 0 and 1439),
  at timestamptz not null,
  payload jsonb not null check(octet_length(payload::text)<=4096)
) with (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=50);
create table wiki_stream.read_usage (
  id boolean primary key default true check(id),
  month date not null,
  bytes bigint not null default 0
);
insert into wiki_stream.read_usage(id,month) values(true,date_trunc('month',now())::date);

create function wiki_stream.schema_bytes() returns bigint language sql stable security definer set search_path=pg_catalog as $$
  select coalesce(sum(pg_total_relation_size(c.oid)),0)::bigint from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='wiki_stream' and c.relkind='r';
$$;
create function wiki_stream.get_sink_state() returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select payload || jsonb_build_object('revision',revision) from wiki_stream.sink_state where id;
$$;
create function wiki_stream.get_source_checkpoint() returns text language sql stable security definer set search_path=pg_catalog as $$
  select event_id from wiki_stream.source_checkpoint where id;
$$;
create function wiki_stream.save_source_checkpoint(event_id text) returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
  if not (select enabled from wiki_stream.settings where id) then raise exception 'Wiki persistence disabled'; end if;
  insert into wiki_stream.source_checkpoint as c(id,event_id) values(true,save_source_checkpoint.event_id)
    on conflict(id) do update set event_id=excluded.event_id;
end $$;

create function wiki_stream.save_sink_state(expected_revision integer, state jsonb, frame jsonb) returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare
  config wiki_stream.settings; current_revision integer; stamp timestamptz; bucket jsonb;
begin
  perform pg_advisory_xact_lock(270026);
  select * into config from wiki_stream.settings where id;
  if not config.enabled then raise exception 'Wiki persistence disabled'; end if;
  if wiki_stream.schema_bytes() >= config.schema_limit_bytes or pg_database_size(current_database()) >= config.database_limit_bytes then
    raise exception 'Wiki storage budget reached; sink stopped without committing Kafka offsets';
  end if;
  select revision into current_revision from wiki_stream.sink_state where id;
  current_revision := coalesce(current_revision,0);
  if current_revision <> expected_revision then raise exception 'Sink revision conflict'; end if;
  stamp := to_timestamp((frame->>'at')::double precision/1000);
  if stamp < now()-interval '1 minute' or stamp > now()+interval '1 minute' then raise exception 'Invalid frame clock'; end if;
  insert into wiki_stream.sink_state(id,revision,payload) values(true,current_revision+1,state)
    on conflict(id) do update set revision=excluded.revision,payload=excluded.payload;
  insert into wiki_stream.frames(slot,at,payload) values((floor(extract(epoch from stamp)/5)::bigint%120)::integer,stamp,frame)
    on conflict(slot) do update set at=excluded.at,payload=excluded.payload;
  select value into bucket from jsonb_array_elements(state->'minutes')
    where (value->>'minute')::bigint = (floor(extract(epoch from stamp)/60)*60000)::bigint limit 1;
  bucket := coalesce(bucket,jsonb_build_object('minute',floor(extract(epoch from stamp)/60)*60000,'count',0));
  insert into wiki_stream.minutes(slot,at,payload) values((floor(extract(epoch from stamp)/60)::bigint%1440)::integer,date_trunc('minute',stamp),bucket)
    on conflict(slot) do update set at=excluded.at,payload=excluded.payload;
  -- Physical row counts are bounded by ring slots even if this cleanup is delayed.
  delete from wiki_stream.frames where at < now()-interval '10 minutes';
  delete from wiki_stream.minutes where at < now()-interval '24 hours';
  return current_revision+1;
end $$;

-- Cached by Next.js for five seconds. Reserve 16 KiB per result, conservatively
-- above the <=6 KiB stored payload, to bound DB response traffic across instances.
-- This is an application budget, not an exact meter of Supabase network billing.
create function wiki_stream.read_frame() returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare config wiki_stream.settings; result jsonb; current_month date := date_trunc('month',now())::date;
begin
  select * into config from wiki_stream.settings where id;
  if not config.enabled then return jsonb_build_object('mode','unavailable','frame',null); end if;
  update wiki_stream.read_usage set
    month=current_month,
    bytes=case when month=current_month then bytes+16384 else 16384 end
  where id and (month<>current_month or bytes+16384<=config.read_budget_bytes);
  if not found then return jsonb_build_object('mode','budget','frame',null); end if;
  select jsonb_build_object('mode',case when at>now()-interval '30 seconds' then 'live' else 'stale' end,'frame',payload)
    into result from wiki_stream.frames order by at desc limit 1;
  return coalesce(result,jsonb_build_object('mode','unavailable','frame',null));
end $$;

create function wiki_stream.health() returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('schemaBytes',wiki_stream.schema_bytes(),'databaseBytes',pg_database_size(current_database()),
    'readReservedBytes',u.bytes,'readMonth',u.month,'enabled',s.enabled,
    'frames',(select count(*) from wiki_stream.frames),'minutes',(select count(*) from wiki_stream.minutes))
  from wiki_stream.settings s cross join wiki_stream.read_usage u;
$$;

revoke all on all functions in schema wiki_stream from public;
grant execute on function wiki_stream.get_sink_state(),wiki_stream.save_sink_state(integer,jsonb,jsonb),
  wiki_stream.get_source_checkpoint(),wiki_stream.save_source_checkpoint(text),wiki_stream.health() to wikistream_pipeline;
grant execute on function wiki_stream.read_frame() to wikistream_reader;
-- The writer cannot change budgets or read the rest of the database through these functions.
commit;
