export interface SSEEvent { id: string; data: string; event: string }

/** Streaming parser: handles split UTF-8, CRLF, comments and multiline data. */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", data: string[] = [], id = "", event = "message";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 256_000) throw new Error("SSE event exceeds buffer limit");
      let end: number;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);
        if (!line) {
          if (data.length) yield { id, data: data.join("\n"), event };
          data = []; event = "message";
        } else if (!line.startsWith(":")) {
          const separator = line.indexOf(":");
          const field = separator === -1 ? line : line.slice(0, separator);
          const content = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
          if (field === "data") data.push(content);
          if (field === "id" && !content.includes("\0")) id = content;
          if (field === "event") event = content;
          if (data.join("\n").length > 256_000) throw new Error("SSE event exceeds data limit");
        }
      }
      if (done) break;
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
