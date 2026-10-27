import { existsSync, readFileSync } from "node:fs";

// Node >=22 in the worker container. Local Next.js and workers share ignored env files.
for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}; see pipelines/wiki-stream/README.md`);
  return value;
}

export function certificate(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  return value.includes("-----BEGIN") ? value.replace(/\\n/g, "\n") : readFileSync(value, "utf8");
}
