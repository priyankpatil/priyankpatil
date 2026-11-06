-- CX evaluation: PII redaction before anything is stored.
--
-- The loader lands each batch in a temporary staging table, then
--   select cx_eval.redact_batch('2026-10-01');
-- masks personal data in the staged transcripts and only the masked records
-- are written to raw_conversations. The staging table is dropped on commit,
-- so names, contact details, identifiers and credentials are never persisted.
--
-- Detection runs in four layers over one conversation at a time:
--   pattern   formats: email, phone, order id, ZIP, street address, username shape
--   context   what the agent just asked for ("may I have your full name?") or a
--             "label: value" line decides what the customer's reply contains
--   template  machine-written action lines ("Account has been pulled up for X.")
--   spread    every value found once is masked everywhere else in the chat,
--             including name parts and the username inside an email address
-- Values become typed placeholders that are consistent within a chat
-- ([NAME_1], [EMAIL_1], …) so the judge still sees "the customer gave their
-- name"; credentials become [SECRET]. Placeholders are not linked across chats.
--
-- Accuracy is measured offline against the customer profiles ABCD ships with
-- each chat (pipelines/cx-eval/scripts/redaction-eval.mts); the profile values
-- are never used for redaction itself and never stored.
--
-- One-time clean-up of data loaded before this migration:
--   select cx_eval.redact_backfill();   -- run at the end of this file

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Words that look like a name in context but are not one.
create or replace function cx_eval.pii_is_common_word(w text)
returns boolean language sql immutable as $$
  select lower(w) = any (array[
    'the','and','for','you','your','yes','yeah','yep','sure','okay','thanks','thank','hello','please','sorry',
    'not','but','can','could','would','will','just','have','has','had','was','were','are','its','it''s','that','this',
    'with','from','what','when','where','why','how','who','which','there','their','them','they','she','him','her',
    'his','our','out','all','any','one','two','order','account','name','full','email','phone','number','address',
    'help','need','want','like','know','see','get','got','still','also','here','now','today','yesterday','tomorrow',
    'item','items','shirt','jeans','boots','jacket','refund','return','card','credit','code','promo','membership',
    'member','gold','silver','bronze','guest','great','good','fine','well','right','correct','ok','hi','hey','dear',
    'customer','agent','support','problem','issue','question','again','time','minute','second','moment','wait',
    'id','username','user','pin','password','security','answer','zip','postal','street','city','state',
    'question','other','covid','exactly','too','perfect','reset','recovery','because','which','written','word',
    'i','im','my','me','so','don','dont','didnt','cant','wont','isnt','doesnt','ive','lol','okay','hmm','maybe',
    'as','follows','on','in','at','of','to','is','spelled','misspelled','wrong','incorrect','changed','different','here'
  ]);
$$;

-- True for tokens that look machine-generated rather than like a word:
-- a digit mixed with letters, all capitals, or few vowels (random letters
-- are ~23% vowels counting y, English words ~40%).
create or replace function cx_eval.pii_looks_random(t text)
returns boolean language sql immutable as $$
  select t ~ '[A-Za-z]' and (
    t ~ '\d'
    or (t = upper(t) and length(t) >= 6)
    or length(regexp_replace(lower(t), '[^aeiouy]', '', 'g'))::numeric / greatest(length(t), 1) <= 0.2
  ) and not cx_eval.pii_is_common_word(t);
$$;

-- Escape a literal for use inside a regular expression.
create or replace function cx_eval.pii_regex_escape(v text)
returns text language sql immutable as $$
  select regexp_replace(v, '([.^$*+?()\[\]{}|\\/-])', '\\\1', 'g');
$$;

-- Adds a detected value to the list unless it is too short or already present.
create or replace function cx_eval.pii_add(hits jsonb, p_kind text, p_value text, p_layer text, p_parent text default null)
returns jsonb language plpgsql immutable as $$
declare
  v text := btrim(coalesce(p_value, ''), E' \t\n.,;:!?"''[]<>');
begin
  -- Never treat our own placeholders as personal data, so redacting already
  -- redacted text changes nothing (the backfill and reloads stay idempotent).
  if length(v) < 3
     or coalesce(p_value, '') ~ '\[(NAME|EMAIL|PHONE|USERNAME|ACCOUNT_ID|ORDER_ID|ZIP|ADDRESS|CITY)_\d+\]|\[SECRET\]'
     or v ~ '^(NAME|EMAIL|PHONE|USERNAME|ACCOUNT_ID|ORDER_ID|ZIP|ADDRESS|CITY)_\d+$' or v = 'SECRET' then
    return hits;
  end if;
  if exists (select 1 from jsonb_array_elements(hits) e where lower(e->>'value') = lower(v)) then
    return hits;
  end if;
  return hits || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'kind', p_kind, 'value', v, 'layer', p_layer, 'parent', p_parent)));
end
$$;

-- Masks the given values in one text. Longest values first, whole tokens only.
create or replace function cx_eval.pii_mask_text(t text, hits jsonb)
returns text language plpgsql immutable as $$
declare
  e record;
  out text := t;
begin
  if t is null or jsonb_array_length(coalesce(hits, '[]')) = 0 then
    return t;
  end if;
  for e in
    select x->>'value' as value, x->>'placeholder' as ph
    from jsonb_array_elements(hits) x
    order by length(x->>'value') desc
  loop
    out := regexp_replace(out, '(?<![A-Za-z0-9])' || cx_eval.pii_regex_escape(e.value) || '(?![A-Za-z0-9])', e.ph, 'gi');
  end loop;
  return out;
end
$$;

-- ── Detection and masking for one conversation ──────────────────────────────

-- turns: [{speaker, text, button?}, …] in order.
-- Returns {turns: masked turns, hits: [{kind, value, layer, placeholder}]}.
-- `hits` holds the original values so callers can mask other text that quotes
-- the chat (judge evidence); callers must not store it.
create or replace function cx_eval.pii_redact(turns jsonb)
returns jsonb language plpgsql immutable as $$
declare
  n         int := coalesce(jsonb_array_length(turns), 0);
  hits     jsonb := '[]';
  i         int;
  spk       text;
  txt       text;
  btn       text;
  prev      text := '';
  since_q   int := 0;   -- customer turns since the agent's last turn
  m         text[];
  seg       text;
  slot      text;
  asked     text;
  x         jsonb;
  counters  jsonb := '{}';
  ph        text;
  placed    jsonb := '[]';
  kind      text;
  k         int;
  masked    jsonb := '[]';
  filler    constant text :=
    '^((sure|yes|yeah|yep|ok|okay|of course|certainly|absolutely|hi|hello|thanks|thank you|it''?s|it is|its|'
    'my|full|name|is|the|account|id|number|pin|security|answer|password|user ?name|zip|code|postal)\M[\s,:!.-]*)+';
begin
  if n = 0 then
    return jsonb_build_object('turns', coalesce(turns, '[]'), 'found', '[]'::jsonb);
  end if;

  for i in 0 .. n - 1 loop
    spk := turns->i->>'speaker';
    txt := coalesce(turns->i->>'text', '');
    btn := turns->i->>'button';

    -- ── Layer: pattern (every speaker) ──
    for m in select regexp_matches(txt, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'g') loop
      hits := cx_eval.pii_add(hits, 'EMAIL', m[1], 'pattern');
    end loop;
    for m in select regexp_matches(txt, '(\(\d{3}\)\s?\d{3}[ .-]?\d{4}|\m\d{3}[ .-]\d{3}[ .-]\d{4}\M)', 'g') loop
      hits := cx_eval.pii_add(hits, 'PHONE', m[1], 'pattern');
    end loop;
    for m in select regexp_matches(txt, '\m(\d{10})\M', 'g') loop
      hits := cx_eval.pii_add(hits, case when prev ~* 'phone' and prev !~* 'order' then 'PHONE' else 'ORDER_ID' end, m[1], 'pattern');
    end loop;
    for m in select regexp_matches(txt,
        '(\m\d{1,5}\s+(?:[A-Za-z0-9]+\s+){0,3}(?:ave|avenue|st|street|rd|road|blvd|boulevard|ln|lane|dr|drive|way|ct|court|pl|place|pkwy|parkway)\M)'
        '(?:\.?\s*,?\s*([A-Za-z]+(?:\s[A-Za-z]+)?)\s*,?\s+([A-Za-z]{2})\.?\s*,?\s*(\d{3,5})\M)?', 'gi') loop
      hits := cx_eval.pii_add(hits, 'ADDRESS', m[1], 'pattern');
      if m[2] is not null then
        hits := cx_eval.pii_add(hits, 'CITY', m[2], 'pattern');
        hits := cx_eval.pii_add(hits, 'ZIP', m[4], 'pattern');
      end if;
    end loop;
    for m in select regexp_matches(txt, '\m(\d{5})\M', 'g') loop
      hits := cx_eval.pii_add(hits, 'ZIP', m[1], 'pattern');
    end loop;
    for m in select regexp_matches(txt, '\m([A-Za-z]{2,24}\d{1,6})\M', 'g') loop
      -- Skip codes and ordinary words with a number ("question3", "COVID19",
      -- promo codes); action lines are covered by the template layer.
      if spk <> 'action' and length(m[1]) >= 5 and m[1] ~ '[a-z]'
         and not cx_eval.pii_is_common_word(regexp_replace(m[1], '\d+$', '')) then
        hits := cx_eval.pii_add(hits, 'USERNAME', m[1], 'pattern');
      end if;
    end loop;
    -- Passwords given by anyone, including agents issuing a new one.
    for m in select regexp_matches(txt, '(?i)password\s*(?:is|:|=)\s*:?\s*["'']?([^\s,;"'']{4,})', 'g') loop
      if (m[1] ~ '\d' or m[1] ~ '[A-Z]') and m[1] ~ '[A-Za-z]' and not cx_eval.pii_is_common_word(m[1]) then
        hits := cx_eval.pii_add(hits, 'SECRET', regexp_replace(m[1], '[.!?]+$', ''), 'pattern');
      end if;
    end loop;
    -- Account ids: 10 characters mixing letters and digits.
    for m in select regexp_matches(txt, '\m([A-Za-z0-9]{10})\M', 'g') loop
      if m[1] ~ '[A-Za-z]' and m[1] ~ '\d' then
        hits := cx_eval.pii_add(hits, 'ACCOUNT_ID', m[1], 'pattern');
      end if;
    end loop;
    -- Six-digit codes (PINs, verification codes) are credentials.
    for m in select regexp_matches(txt, '\m(\d{6})\M', 'g') loop
      hits := cx_eval.pii_add(hits, 'SECRET', m[1], 'pattern');
    end loop;

    -- ── Layer: template (machine-written action lines) ──
    if spk = 'action' then
      slot := substring(txt from '(?i)^Account has been pulled up for\s+(.+?)\s*\.*\s*$');
      if slot is not null then
        hits := cx_eval.pii_add(hits,
          case
            when slot ~ '@' then 'EMAIL'
            when slot ~ '^\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}$' then 'PHONE'
            when slot ~ '^\d{10}$' then 'ORDER_ID'
            when slot ~* '^[a-z0-9]{10}$' and slot ~* '[a-z]' and slot !~ ' ' then 'ACCOUNT_ID'
            when slot ~* '^[a-z]{2,24}\d{1,6}$' then 'USERNAME'
            when slot ~ '\d' and slot !~ ' ' then 'ACCOUNT_ID'
            else 'NAME'
          end, slot, 'template');
      end if;
      slot := substring(txt from '(?i)^Details of\s+(.+?)\s+have been entered\.?\s*$');
      if slot is not null and slot ~* '^[a-z0-9]{10}$' and slot ~* '[a-z]' then
        hits := cx_eval.pii_add(hits, 'ACCOUNT_ID', slot, 'template');
      end if;
    end if;

    -- ── Layer: context (customer replies and "label: value" lines) ──
    if spk = 'customer' then
      -- Labelled values anywhere in the reply.
      for m in select regexp_matches(txt, '(?i)\muser(?:\s?name|\s?id)?\s*(?:is|:|-|=)\s*([A-Za-z0-9._-]{3,})|\muser\s?name\s+([A-Za-z0-9._-]{3,})', 'g') loop
        m[1] := coalesce(m[1], m[2]);
        if m[1] ~ '\d' and not cx_eval.pii_is_common_word(m[1]) then
          hits := cx_eval.pii_add(hits, 'USERNAME', m[1], 'context');
        end if;
      end loop;
      for m in select regexp_matches(txt, '(?i)account\s?(?:id|number|#|no\.?)?\s*(?:is|:|-|=)\s*([A-Za-z0-9]{10})\M', 'g') loop
        if cx_eval.pii_looks_random(m[1]) then
          hits := cx_eval.pii_add(hits, 'ACCOUNT_ID', m[1], 'context');
        end if;
      end loop;
      for m in select regexp_matches(txt, '(?i)\m([A-Za-z0-9]{10})\s+is\s+(?:my|the)\s+account', 'g') loop
        if cx_eval.pii_looks_random(m[1]) then
          hits := cx_eval.pii_add(hits, 'ACCOUNT_ID', m[1], 'context');
        end if;
      end loop;
      for m in select regexp_matches(txt, '(?i)\mpin\M(?:\s+(?:number|#|code))?(?:\W+\w+){0,3}?\W+(\d{3,8})\M', 'g') loop
        hits := cx_eval.pii_add(hits, 'SECRET', m[1], 'context');
      end loop;
      for m in select regexp_matches(txt,
          '(?i)(?:security\s?(?:answer|question|word)|maiden name)\s*(?:which\s+)?(?:is|:|-|=)\s*:?\s*["'']?([A-Za-z]+)', 'g') loop
        if not cx_eval.pii_is_common_word(m[1]) then
          hits := cx_eval.pii_add(hits, 'SECRET', m[1], 'context');
        end if;
      end loop;
      for m in select regexp_matches(txt, '(?i)\m([A-Za-z]+)\s+is\s+the\s+(?:security\s+)?answer', 'g') loop
        if not cx_eval.pii_is_common_word(m[1]) then
          hits := cx_eval.pii_add(hits, 'SECRET', m[1], 'context');
        end if;
      end loop;
      for m in select regexp_matches(txt, '(?i)(?:my (?:full )?name is|full name\s*(?:is|:)|\mname\s*:)\s*([A-Za-z]+(?:[\s''-][A-Za-z]+){0,2})', 'g') loop
        if not exists (select 1 from regexp_split_to_table(m[1], '[\s''-]+') w where cx_eval.pii_is_common_word(w)) then
          hits := cx_eval.pii_add(hits, 'NAME', m[1], 'context');
        end if;
      end loop;

      -- What the agent just asked for decides what a bare reply contains,
      -- for the first two customer turns after the question only.
      since_q := since_q + 1;
      asked := case when since_q <= 2 then lower(prev) else '' end;
      foreach seg in array regexp_split_to_array(txt, '\s*(?:[,;\n/]|[.!?](?:\s|$)|\s-\s|\s(?:and|&)\s)\s*') loop
        seg := btrim(regexp_replace(seg, filler, '', 'i'), E' \t.,;:!?"''');
        continue when seg = '';
        if asked ~ '\mname\M' and asked !~ 'user ?name'
           and seg ~* '^[a-z]+(?:[''-][a-z]+)?(?:\s+[a-z]+(?:[''-][a-z]+)?){1,2}$'
           and not exists (select 1 from regexp_split_to_table(seg, '\s+') w where cx_eval.pii_is_common_word(w)) then
          hits := cx_eval.pii_add(hits, 'NAME', seg, 'context');
        end if;
        if asked ~ 'account' then
          for m in select regexp_matches(seg, '\m([A-Za-z0-9]{10})\M', 'g') loop
            if cx_eval.pii_looks_random(m[1]) then
              hits := cx_eval.pii_add(hits, 'ACCOUNT_ID', m[1], 'context');
            end if;
          end loop;
        end if;
        if asked ~ '\mpin\M' then
          for m in select regexp_matches(seg, '\m(\d{3,8})\M', 'g') loop
            hits := cx_eval.pii_add(hits, 'SECRET', m[1], 'context');
          end loop;
        end if;
        if asked ~ 'security|maiden|mother|\manswer\M' and seg ~* '^["'']?[a-z]+(?:\s[a-z]+){0,1}["'']?$' and not cx_eval.pii_is_common_word(seg) then
          hits := cx_eval.pii_add(hits, 'SECRET', seg, 'context');
        end if;
        if asked ~ 'password' and seg ~ '^\S{4,}$' and (seg ~ '\d' or seg ~ '[A-Z].*[a-z]|[a-z].*[A-Z]') and not cx_eval.pii_is_common_word(seg) then
          hits := cx_eval.pii_add(hits, 'SECRET', seg, 'context');
        end if;
        if asked ~ '\mzip|postal' then
          for m in select regexp_matches(seg, '\m(\d{3,5})\M', 'g') loop
            hits := cx_eval.pii_add(hits, 'ZIP', m[1], 'context');
          end loop;
        end if;
        if asked ~ 'user ?name' and seg ~* '^[a-z0-9._-]{3,}$' and seg ~ '\d' and not cx_eval.pii_is_common_word(seg) then
          hits := cx_eval.pii_add(hits, 'USERNAME', seg, 'context');
        end if;
      end loop;
    end if;

    if spk = 'agent' then
      prev := txt;
      since_q := 0;
    end if;
  end loop;

  -- ── Layer: spread (derived values) ──
  for x in select * from jsonb_array_elements(hits) loop
    if x->>'kind' = 'NAME' then
      for seg in select w from regexp_split_to_table(x->>'value', '[\s''-]+') w loop
        if length(seg) >= 3 and not cx_eval.pii_is_common_word(seg) then
          hits := cx_eval.pii_add(hits, 'NAME', seg, 'spread', x->>'value');
        end if;
      end loop;
    elsif x->>'kind' = 'EMAIL' then
      hits := cx_eval.pii_add(hits, 'USERNAME', split_part(x->>'value', '@', 1), 'spread');
    end if;
  end loop;

  -- Placeholders: numbered per kind in order of first appearance; name parts
  -- share their full name's placeholder; credentials are never numbered.
  for x in select * from jsonb_array_elements(hits) loop
    kind := x->>'kind';
    if kind = 'SECRET' then
      ph := '[SECRET]';
    elsif x ? 'parent' then
      select p->>'placeholder' into ph from jsonb_array_elements(placed) p
      where lower(p->>'value') = lower(x->>'parent');
    else
      k := coalesce((counters->>kind)::int, 0) + 1;
      counters := counters || jsonb_build_object(kind, k);
      ph := '[' || kind || '_' || k || ']';
    end if;
    placed := placed || jsonb_build_array(x || jsonb_build_object('placeholder', coalesce(ph, '[' || kind || ']')));
  end loop;

  for i in 0 .. n - 1 loop
    x := turns->i;
    masked := masked || jsonb_build_array(
      x || jsonb_build_object('text', cx_eval.pii_mask_text(x->>'text', placed)));
  end loop;

  return jsonb_build_object('turns', masked, 'found', placed);
end
$$;

-- ── Stage: redact a staged batch ────────────────────────────────────────────

-- Counts only: never values.
create table if not exists cx_eval.redaction_log (
  batch_date    date not null,
  kind          text not null,
  layer         text not null,
  values_found  int not null,
  conversations int not null,
  logged_at     timestamptz not null default now(),
  primary key (batch_date, kind, layer)
);

-- Called by the loader inside its load transaction, after it has filled the
-- temporary table cx_staged_conversations (convo_id, payload). Masks the
-- transcript (or `messages`, the day-26 renamed field, so validation still
-- sees the incident) in place.
create or replace function cx_eval.redact_batch(p_batch date)
returns jsonb language plpgsql as $$
declare
  v_run  bigint;
  v_in   int;
  v_vals int;
  r      record;
  res    jsonb;
  field  text;
begin
  insert into cx_eval.pipeline_runs (stage, batch_date) values ('redact', p_batch) returning run_id into v_run;
  create temporary table if not exists cx_redaction_counts (convo_id text, kind text, layer text) on commit drop;
  delete from cx_redaction_counts;

  select count(*) into v_in from cx_staged_conversations;
  for r in select convo_id, payload from cx_staged_conversations loop
    field := case when r.payload ? 'transcript' then 'transcript' when r.payload ? 'messages' then 'messages' end;
    continue when field is null or jsonb_typeof(r.payload->field) <> 'array';
    res := cx_eval.pii_redact(r.payload->field);
    update cx_staged_conversations set payload = jsonb_set(payload, array[field], res->'turns')
    where convo_id = r.convo_id;
    insert into cx_redaction_counts
    select r.convo_id, f->>'kind', f->>'layer' from jsonb_array_elements(res->'found') f;
  end loop;

  delete from cx_eval.redaction_log where batch_date = p_batch;
  insert into cx_eval.redaction_log (batch_date, kind, layer, values_found, conversations)
  select p_batch, kind, layer, count(*), count(distinct convo_id) from cx_redaction_counts group by kind, layer;
  select count(*) into v_vals from cx_redaction_counts;

  update cx_eval.pipeline_runs set finished_at = now(), status = 'ok', rows_in = v_in, rows_out = v_in,
    detail = jsonb_build_object('values_masked', v_vals) where run_id = v_run;
  return jsonb_build_object('stage', 'redact', 'batch', p_batch, 'conversations', v_in, 'values_masked', v_vals);
exception when others then
  update cx_eval.pipeline_runs set finished_at = now(), status = 'failed', error = sqlerrm where run_id = v_run;
  raise;
end
$$;

-- ── One-time clean-up of data loaded before redaction existed ───────────────

-- Re-detects values from each stored raw payload, then masks the payload and
-- every copy or quote of the chat: turns, judge inputs, judge outputs and
-- evidence, and human-label notes. Idempotent: a clean chat yields no values.
-- Prompt hashes on judge_results still describe the prompt that was sent.
create or replace function cx_eval.redact_backfill()
returns jsonb language plpgsql as $$
declare
  r      record;
  res    jsonb;
  hits  jsonb;
  field  text;
  n_conv int := 0;
  n_vals int := 0;
begin
  for r in select convo_id, payload from cx_eval.raw_conversations loop
    field := case when r.payload ? 'transcript' then 'transcript' when r.payload ? 'messages' then 'messages' end;
    continue when field is null or jsonb_typeof(r.payload->field) <> 'array';
    res := cx_eval.pii_redact(r.payload->field);
    hits := res->'found';
    continue when jsonb_array_length(hits) = 0;
    n_conv := n_conv + 1;
    n_vals := n_vals + jsonb_array_length(hits);

    update cx_eval.raw_conversations set payload = jsonb_set(payload, array[field], res->'turns')
    where convo_id = r.convo_id;
    update cx_eval.turns set text = cx_eval.pii_mask_text(text, hits)
    where convo_id = r.convo_id;
    update cx_eval.scoring_requests q
    set context = jsonb_set(q.context, '{turns}', (
      select jsonb_agg(t || jsonb_build_object('text', cx_eval.pii_mask_text(t->>'text', hits)) order by o)
      from jsonb_array_elements(q.context->'turns') with ordinality as a(t, o)))
    where q.convo_id = r.convo_id and jsonb_typeof(q.context->'turns') = 'array';
    update cx_eval.judge_results j set raw_content = cx_eval.pii_mask_text(j.raw_content, hits)
    from cx_eval.scoring_requests q
    where q.request_id = j.request_id and q.convo_id = r.convo_id and j.raw_content is not null;
    update cx_eval.scores set evidence = cx_eval.pii_mask_text(evidence, hits)
    where convo_id = r.convo_id and evidence is not null;
    update cx_eval.human_labels set notes = cx_eval.pii_mask_text(notes, hits)
    where convo_id = r.convo_id and notes is not null;
  end loop;
  return jsonb_build_object('conversations_cleaned', n_conv, 'values_masked', n_vals);
end
$$;

-- ── Monitoring: personal data that got past redaction ───────────────────────

-- Formats that should never appear after redaction. Runs per batch from
-- run_checks(); a hit is a privacy incident, not a data-quality warning.
create or replace function cx_eval.pii_leaks(p_batch date)
returns table (pattern text, turns bigint)
language sql stable as $$
  select x.pattern, count(*)
  from cx_eval.turns t
  join cx_eval.conversations c using (convo_id)
  cross join lateral (values
    ('email', t.text ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'),
    ('phone', t.text ~ '\(\d{3}\)\s?\d{3}[ .-]?\d{4}'),
    ('account pulled up for a person', t.text ~* '^Account has been pulled up for\s+(?!\[)[A-Za-z]{3,}')
  ) as x(pattern, hit)
  where c.batch_date = p_batch and x.hit
  group by x.pattern;
$$;

-- run_checks(), as in 20261022030000_cx_eval_ops.sql, plus a privacy layer.
create or replace function cx_eval.run_checks(p_batch date)
returns jsonb language plpgsql as $$
declare
  v_run bigint;
  v_n   int;
  r     record;
begin
  insert into cx_eval.pipeline_runs (stage, batch_date) values ('checks', p_batch) returning run_id into v_run;

  -- ── Data layer ──
  for r in
    select h.*, avg(p.loaded) as avg_prior
    from cx_eval.mart_pipeline_health h
    left join cx_eval.mart_pipeline_health p on p.batch_date between p_batch - 7 and p_batch - 1
    where h.batch_date = p_batch
    group by h.batch_date, h.incident, h.loaded, h.quarantined, h.quarantine_pct, h.quarantine_checks, h.warnings,
             h.loaded_at, h.transformed_at, h.failed_stage_runs, h.requests, h.scored, h.score_failed, h.score_pending,
             h.p50_latency_ms, h.p95_latency_ms, h.tokens_per_chat, h.repaired, h.judge_errors
  loop
    if r.quarantine_pct >= 5 then
      perform cx_eval.raise_alert(v_run, p_batch, 'quarantine_rate', 'data', 'critical', '',
        format('%s%% of records quarantined (%s of %s): %s. Warnings: %s.', r.quarantine_pct, r.quarantined, r.loaded,
               r.quarantine_checks, coalesce(r.warnings, 'none')),
        jsonb_build_object('quarantined', r.quarantined, 'loaded', r.loaded, 'checks', r.quarantine_checks, 'warnings', r.warnings));
    end if;
    if r.avg_prior is not null and abs(r.loaded - r.avg_prior) / r.avg_prior > 0.3 then
      perform cx_eval.raise_alert(v_run, p_batch, 'volume', 'data', 'warn', '',
        format('Loaded %s records vs a 7-day average of %s.', r.loaded, round(r.avg_prior)),
        jsonb_build_object('loaded', r.loaded, 'avg_prior', round(r.avg_prior)));
    end if;
    if r.failed_stage_runs > 0 then
      perform cx_eval.raise_alert(v_run, p_batch, 'stage_failure', 'data', 'critical', '',
        format('%s pipeline stage run(s) failed for this batch.', r.failed_stage_runs),
        jsonb_build_object('failed_runs', r.failed_stage_runs));
    end if;

    -- ── Model layer: judge operations ──
    if r.requests > 0 and (r.score_failed::numeric / r.requests) > 0.1 then
      perform cx_eval.raise_alert(v_run, p_batch, 'judge_errors', 'model', 'warn', '',
        format('%s of %s scoring requests failed.', r.score_failed, r.requests),
        jsonb_build_object('failed', r.score_failed, 'requests', r.requests));
    end if;
    if r.p95_latency_ms > 60000 then
      perform cx_eval.raise_alert(v_run, p_batch, 'judge_latency', 'model', 'warn', '',
        format('p95 judge latency %ss (p50 %ss).', round(r.p95_latency_ms / 1000.0, 1), round(r.p50_latency_ms / 1000.0, 1)),
        jsonb_build_object('p50_ms', r.p50_latency_ms, 'p95_ms', r.p95_latency_ms));
    end if;
  end loop;

  -- ── Privacy layer: personal data that got past redaction ──
  for r in select * from cx_eval.pii_leaks(p_batch) loop
    perform cx_eval.raise_alert(v_run, p_batch, 'pii_leak', 'data', 'critical', r.pattern,
      format('%s turn(s) still contain personal data (%s) after redaction.', r.turns, r.pattern),
      jsonb_build_object('pattern', r.pattern, 'turns', r.turns));
  end loop;

  -- ── Model layer: judge drift that ground truth does not explain ──
  -- PSI over a 3-day window (~60 scored chats) has sampling noise of about
  -- 0.1–0.15 on its own, so thresholds sit above it: warn 0.2, critical 0.3.
  for r in
    select d.*, (select string_agg(distinct model, ', ') from cx_eval.mart_conversation_scores m
                 where m.batch_date between p_batch - 2 and p_batch) as models
    from cx_eval.mart_drift d
    where d.batch_date = p_batch and d.judge_psi >= 0.2 and coalesce(d.truth_psi, 0) < 0.1
  loop
    perform cx_eval.raise_alert(v_run, p_batch, 'judge_drift', 'model', case when r.judge_psi >= 0.3 then 'critical' else 'warn' end,
      r.dimension,
      format('Judge scores for %s shifted (PSI %s) while ground truth did not (PSI %s). Models in window: %s.',
             r.dimension, r.judge_psi, coalesce(r.truth_psi::text, 'n/a'), r.models),
      jsonb_build_object('judge_psi', r.judge_psi, 'truth_psi', r.truth_psi, 'models', r.models));
  end loop;

  -- ── Model layer: accuracy vs ground truth (trailing 3 days vs the first 7) ──
  for r in
    with base as (
      select avg(identity_correct::int) as id_acc, avg(policy_correct::int) as pol_acc
      from cx_eval.mart_conversation_scores, (select min(batch_date) as d0 from cx_eval.raw_batches) b
      where batch_date < b.d0 + 7),
    recent as (
      select avg(identity_correct::int) as id_acc, avg(policy_correct::int) as pol_acc, count(*) as n
      from cx_eval.mart_conversation_scores where batch_date between p_batch - 2 and p_batch)
    select x.dimension, x.base_acc, x.recent_acc, recent.n
    from base, recent
    cross join lateral (values ('identity_verification', base.id_acc, recent.id_acc),
                               ('policy_adherence', base.pol_acc, recent.pol_acc)) as x(dimension, base_acc, recent_acc)
    where recent.n >= 30 and x.base_acc - x.recent_acc >= 0.15
  loop
    perform cx_eval.raise_alert(v_run, p_batch, 'judge_accuracy', 'model', 'warn', r.dimension,
      format('Judge accuracy on %s fell to %s%% (baseline %s%%) over the last 3 days.',
             r.dimension, round(100 * r.recent_acc), round(100 * r.base_acc)),
      jsonb_build_object('baseline', round(100 * r.base_acc, 1), 'recent', round(100 * r.recent_acc, 1), 'n', r.n));
  end loop;

  -- ── Business layer: CSAT (trailing 3 days vs the 7 before) ──
  for r in
    select avg(score) filter (where batch_date between p_batch - 2 and p_batch) as recent,
           avg(score) filter (where batch_date between p_batch - 9 and p_batch - 3) as prior,
           count(*) filter (where batch_date between p_batch - 2 and p_batch) as n
    from cx_eval.csat_responses
  loop
    if r.n >= 100 and r.prior - r.recent >= 0.25 then
      perform cx_eval.raise_alert(v_run, p_batch, 'csat_drop', 'business', 'warn', '',
        format('CSAT %s over the last 3 days vs %s the week before.', round(r.recent, 2), round(r.prior, 2)),
        jsonb_build_object('recent', round(r.recent, 2), 'prior', round(r.prior, 2), 'responses', r.n));
    end if;
  end loop;

  -- ── Business layer: a team's identity compliance vs its own baseline ──
  -- Population metric (all conversations, not the scored sample), so it is
  -- independent of the judge.
  for r in
    select team_id,
           avg((gt_identity = 'pass')::int) filter (where batch_date between p_batch - 2 and p_batch) as recent,
           avg((gt_identity = 'pass')::int) filter (where batch_date < p_batch - 2) as prior,
           count(*) filter (where batch_date between p_batch - 2 and p_batch) as n,
           count(*) filter (where batch_date < p_batch - 2) as n_prior
    from cx_eval.conversations
    where gt_identity <> 'na' and batch_date between p_batch - 16 and p_batch
    group by team_id
  loop
    -- A baseline needs history: ~1 week of the team's chats before comparing.
    if r.n >= 40 and r.n_prior >= 150 and r.prior - r.recent >= 0.10 then
      perform cx_eval.raise_alert(v_run, p_batch, 'cohort_compliance', 'business', 'warn', r.team_id,
        format('Team %s identity compliance %s%% over the last 3 days vs %s%% before.',
               r.team_id, round(100 * r.recent), round(100 * r.prior)),
        jsonb_build_object('team', r.team_id, 'recent', round(100 * r.recent, 1), 'prior', round(100 * r.prior, 1), 'n', r.n));
    end if;
  end loop;

  update cx_eval.alerts set status = 'resolved', resolved_at = now()
  where batch_date = p_batch and status = 'open' and last_seen_run is distinct from v_run;

  select count(*) into v_n from cx_eval.alerts where batch_date = p_batch and status = 'open';
  update cx_eval.pipeline_runs set finished_at = now(), status = 'ok', rows_out = v_n where run_id = v_run;
  return jsonb_build_object('stage', 'checks', 'batch', p_batch, 'open_alerts', v_n);
end
$$;

-- ── Permissions ─────────────────────────────────────────────────────────────

grant select, insert, update, delete on cx_eval.redaction_log to cxeval_pipeline;
grant execute on all functions in schema cx_eval to cxeval_pipeline;

-- ── Clean data loaded before this migration ─────────────────────────────────

select cx_eval.redact_backfill();
