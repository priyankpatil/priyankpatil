import { kafka, TOPICS } from "../src/kafka.ts";

const admin = kafka().admin();
try {
  await admin.connect();
  const existing = await admin.listTopics();
  const missing = Object.values(TOPICS).filter((topic) => !existing.includes(topic));
  if (missing.length) await admin.createTopics({
    waitForLeaders: true,
    topics: missing.map((topic) => ({ topic, numPartitions: 2, replicationFactor: 1 })),
  });
  const metadata = await admin.fetchTopicMetadata({ topics: Object.values(TOPICS) });
  console.log(JSON.stringify(metadata.topics.map(({ name, partitions }) => ({ name, partitions: partitions.length })), null, 2));
} finally { await admin.disconnect(); }
