import type { EnrichedEdit, WikiFrame } from "../../../lib/wiki-stream/types.ts";
import { applyEvents, makeFrame, type SinkState } from "./state.ts";

export interface BufferedBatch {
  records: { edit: EnrichedEdit; partition: number; offset: string }[];
  lag: number;
}

/** Both partitions share a snapshot. No caller acknowledges before persistence. */
export class SnapshotWriter {
  private pending: { batch: BufferedBatch; resolve: () => void; reject: (error: unknown) => void }[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private saving = false;
  private lastWrite = 0;
  constructor(private state: SinkState, private persist: (state: SinkState, frame: WikiFrame) => Promise<void>, private interval = 5000) {}

  enqueue(batch: BufferedBatch): Promise<void> {
    return new Promise((resolve, reject) => { this.pending.push({ batch, resolve, reject }); this.schedule(); });
  }

  private schedule() {
    if (this.timer || this.saving || !this.pending.length) return;
    const wait = this.lastWrite ? Math.max(0, this.interval - (Date.now() - this.lastWrite)) : this.interval;
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, wait);
  }

  async flush() {
    if (this.saving || !this.pending.length) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined; this.saving = true;
    const pending = this.pending.splice(0);
    try {
      const next = applyEvents(this.state, pending.flatMap((p) => p.batch.records));
      const frame = makeFrame(next, pending.reduce((sum, p) => sum + p.batch.lag, 0));
      await this.persist(next, frame);
      this.state = next; this.lastWrite = Date.now(); pending.forEach((p) => p.resolve());
    } catch (error) { pending.forEach((p) => p.reject(error)); }
    finally { this.saving = false; this.schedule(); }
  }
}
