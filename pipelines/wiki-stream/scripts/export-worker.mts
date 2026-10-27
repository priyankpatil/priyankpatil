import { mkdir, writeFile } from "node:fs/promises";
import { certificate, required } from "../src/env.ts";

const settings: Record<string, string> = {
  KAFKA_BROKERS: required("KAFKA_BROKERS"),
  WIKISTREAM_DATABASE_URL: required("WIKISTREAM_DATABASE_URL"),
  WIKISTREAM_USER_AGENT: process.env.WIKISTREAM_USER_AGENT || "PriyankPatilWikiStream/0.1 (https://github.com/priyankpatil/priyankpatil)",
};
for (const name of ["KAFKA_CA", "KAFKA_CERT", "KAFKA_KEY", "WIKISTREAM_DATABASE_CA"]) {
  const value = certificate(name);
  if (value) settings[name] = value;
}
for (const name of ["KAFKA_USERNAME", "KAFKA_PASSWORD"]) if (process.env[name]) settings[name] = process.env[name]!;
// Docker --env-file keeps quotes literally. Emit unquoted values, converting PEM
// newlines to literal \n; certificate() converts them back inside the container.
const content = Object.entries(settings).map(([name, value]) => `${name}=${value.replace(/\r/g, "").replace(/\n/g, "\\n")}`).join("\n") + "\n";
await mkdir("pipelines/wiki-stream/.secrets", { recursive: true, mode: 0o700 });
await writeFile("pipelines/wiki-stream/.secrets/worker.env", content, { mode: 0o600 });
console.log("Exported minimal worker settings to ignored .secrets/worker.env (permissions 600). No admin or website-reader URL included.");
