/** Kafka sessions must stay alive while broker retries or database writes wait. */
export async function withHeartbeats<T>(heartbeat: () => Promise<void>, operation: () => Promise<T>): Promise<T> {
  let pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (!pending) pending = heartbeat().catch(() => {
      // The next explicit heartbeat/commit propagates membership failures to
      // KafkaJS; do not create an unhandled rejection from the timer.
    }).finally(() => { pending = undefined; });
  }, 2000);
  try { return await operation(); }
  finally { clearInterval(timer); await pending; }
}
