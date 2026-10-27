import pg from "pg";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { required } from "../src/env.ts";
import { initialState, makeFrame } from "../src/state.ts";

// Check performs all schema and privilege tests in a transaction then rolls back.
// Apply is deliberately explicit; it only initializes a previously absent schema.
const db = new pg.Client({ connectionString: required("SUPABASE_DB_URL"), connectionTimeoutMillis: 10_000 });
const apply = process.argv.includes("--apply");
await db.connect();
try {
  const existing = (await db.query("select to_regnamespace('wiki_stream') as schema")).rows[0].schema;
  if (existing) {
    console.log("wiki_stream already exists. Current health:", (await db.query("select wiki_stream.health() as health")).rows[0].health);
    if (apply) console.log("No migration or credential changes made.");
  } else {
    const migration = await readFile("supabase/migrations/20261027000000_wiki_stream.sql", "utf8");
    const transactional = migration.replace(/commit;\s*$/i, "");
    await db.query(transactional);
    // Supabase's admin role is not a PostgreSQL superuser. Temporarily grant
    // membership to exercise restricted roles, then roll it back with the tests.
    await db.query("grant wikistream_pipeline, wikistream_reader to current_user");
    const now = Date.now(), state = initialState(now), frame = makeFrame(state, 0, now);
    await db.query("set local role wikistream_pipeline");
    const revision = (await db.query("select wiki_stream.save_sink_state(0,$1::jsonb,$2::jsonb) as revision", [JSON.stringify(state), JSON.stringify(frame)])).rows[0].revision;
    assert.equal(revision, 1);
    assert.equal((await db.query("select wiki_stream.get_sink_state() as state")).rows[0].state.revision, 1);
    await db.query("select wiki_stream.save_source_checkpoint($1)", ["test-checkpoint"]);
    assert.equal((await db.query("select wiki_stream.get_source_checkpoint() as id")).rows[0].id, "test-checkpoint");
    assert.equal((await db.query("select has_table_privilege(current_user,'wiki_stream.frames','insert') as allowed")).rows[0].allowed, false);
    await db.query("reset role");
    await db.query("update wiki_stream.settings set read_budget_bytes=16384 where id");
    await db.query("set local role wikistream_reader");
    assert.equal((await db.query("select wiki_stream.read_frame() as response")).rows[0].response.mode, "live");
    assert.equal((await db.query("select wiki_stream.read_frame() as response")).rows[0].response.mode, "budget");
    assert.equal((await db.query("select has_table_privilege(current_user,'wiki_stream.sink_state','select') as allowed")).rows[0].allowed, false);
    await db.query("reset role");
    await db.query("savepoint budget_test");
    await db.query("update wiki_stream.settings set schema_limit_bytes=1 where id");
    await assert.rejects(db.query("select wiki_stream.save_sink_state(1,$1::jsonb,$2::jsonb)", [JSON.stringify(state), JSON.stringify(frame)]), /storage budget reached/);
    await db.query("rollback to savepoint budget_test");
    await db.query("rollback");
    console.log("Migration, role isolation, atomic state, source checkpoints, read budget and storage cutoff passed; validation rolled back.");
    if (apply) {
      const localPath = ".env.local";
      let local = await readFile(localPath, "utf8").catch(() => "");
      const vars: Record<string, string> = {};
      await db.query(transactional);
      for (const [role, key] of [["wikistream_pipeline", "WIKISTREAM_DATABASE_URL"], ["wikistream_reader", "WIKISTREAM_READ_URL"]]) {
        // Existing unrelated roles are never touched. These two names are reserved
        // for this project by the migration; passwords are never printed.
        const password = randomBytes(32).toString("hex");
        const statement = (await db.query("select format('alter role %I password %L',$1::text,$2::text) as sql", [role, password])).rows[0].sql;
        await db.query(statement);
        const url = new URL(required("SUPABASE_DB_URL"));
        const user = decodeURIComponent(url.username);
        url.username = user.includes(".") ? `${role}.${user.split(".").slice(1).join(".")}` : role;
        url.password = password;
        vars[key] = url.toString();
      }
      await db.query("commit");
      for (const [key, value] of Object.entries(vars)) {
        const line = `${key}=${JSON.stringify(value)}`;
        const pattern = new RegExp(`^${key}=.*$`, "m");
        local = pattern.test(local) ? local.replace(pattern, () => line) : `${local.trimEnd()}\n${line}\n`;
      }
      await writeFile(localPath, local, { mode: 0o600 });
      console.log("Created wiki_stream and dedicated roles. Connection URLs saved only in ignored .env.local.");
      console.log("Storage:", (await db.query("select wiki_stream.health() as health")).rows[0].health);
    }
  }
} finally { await db.query("rollback").catch(() => {}); await db.end(); }
