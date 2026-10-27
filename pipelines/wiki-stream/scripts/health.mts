import { database } from "../src/database.ts";
import { kafka, TOPICS } from "../src/kafka.ts";

const db = database();
try {
  console.log("Supabase", (await db.query("select wiki_stream.health() as health")).rows[0].health);
  if (process.argv.includes("--kafka")) {
    const admin = kafka().admin();
    try {
      await admin.connect();
      console.log("Kafka", (await admin.fetchTopicMetadata({ topics: Object.values(TOPICS) })).topics.map((t) => ({ name: t.name, partitions: t.partitions.length })));
    } finally { await admin.disconnect(); }
  }
} finally { await db.end(); }
