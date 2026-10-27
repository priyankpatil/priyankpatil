export function sourceResume(checkpoint: string, lastAccepted: number | undefined, now = Date.now()) {
  const omittedHistory = Boolean(checkpoint && (!lastAccepted || now - lastAccepted > 15 * 60_000));
  return { checkpoint: omittedHistory ? "" : checkpoint, omittedHistory,
    since: omittedHistory ? new Date(now - 60_000).toISOString() : undefined };
}
