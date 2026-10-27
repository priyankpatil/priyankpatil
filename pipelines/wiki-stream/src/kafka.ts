import { Kafka, logLevel } from "kafkajs";
import { certificate, required } from "./env.ts";

export const TOPICS = { raw: "wiki.edits.raw", enriched: "wiki.edits.enriched", dlq: "wiki.edits.dlq" };

export function kafka() {
  const brokers = required("KAFKA_BROKERS").split(",").map((s) => s.trim());
  if (brokers.some((b) => !b || b.includes("://"))) throw new Error("KAFKA_BROKERS must contain host:port entries, not URLs");
  const cert = certificate("KAFKA_CERT"), key = certificate("KAFKA_KEY");
  const username = process.env.KAFKA_USERNAME, password = process.env.KAFKA_PASSWORD;
  if (!(cert && key) && !(username && password)) throw new Error("Configure Aiven client certificates OR a SASL username/password");
  return new Kafka({
    clientId: "wiki-stream", brokers,
    ssl: { rejectUnauthorized: true, ca: certificate("KAFKA_CA") ? [certificate("KAFKA_CA")!] : undefined, cert, key },
    sasl: username && password ? { mechanism: "scram-sha-256", username, password } : undefined,
    logLevel: logLevel.ERROR, connectionTimeout: 15_000, requestTimeout: 30_000,
    retry: { retries: 8 },
  });
}
