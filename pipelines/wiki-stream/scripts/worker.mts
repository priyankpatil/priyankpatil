import { spawn } from "node:child_process";
import "../src/env.ts";
import { kafka } from "../src/kafka.ts";
import { database } from "../src/database.ts";
import { createServer } from "node:http";

// Fail once, before starting child processes, for missing env/certificate files.
kafka();
const preflight = database();
await preflight.end();

// One deployable container, three independent processes and consumer groups.
// Any child exit stops the others; let the container host restart the worker.
const startedAt = Date.now();
const stages: Record<string, { at: number }> = {};
const names = ["produce", "enrich", "sink"];
const children = names.map((name) => spawn(process.execPath,
  ["--import", "tsx", `pipelines/wiki-stream/scripts/${name}.mts`], { stdio: ["inherit", "inherit", "inherit", "ipc"], env: process.env }));
children.forEach((child, index) => child.on("message", (message) => {
  if (typeof message === "object" && message !== null && "heartbeat" in message) stages[names[index]] = { at: Date.now() };
}));
// Optional HTTP health endpoint makes the same container usable as a web service.
// It contains no connection strings, broker addresses, keys or raw event data.
const port = Number(process.env.PORT);
const server = process.env.PORT ? createServer((req, res) => {
  if (req.url !== "/health" && req.url !== "/") { res.writeHead(404); res.end(); return; }
  const ready = !stopping && (Date.now() - startedAt < 90_000 || names.every((name) => stages[name] && Date.now() - stages[name].at < 90_000));
  res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ ready, uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), stages }));
}) : undefined;
if (server) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535");
  server.listen(port, "0.0.0.0");
  server.on("error", () => shutdown(1));
}
let stopping = false;
function shutdown(code: number) {
  if (stopping) return;
  stopping = true; process.exitCode = code;
  server?.close();
  for (const child of children) child.kill("SIGTERM");
  const timeout = setTimeout(() => { for (const child of children) child.kill("SIGKILL"); }, 15_000);
  timeout.unref();
}
children.forEach((child) => {
  child.on("error", () => shutdown(1));
  child.on("exit", () => { if (!stopping) shutdown(1); });
});
process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
