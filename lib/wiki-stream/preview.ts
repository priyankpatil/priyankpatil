import capture from "./recorded.json";
import type { DisplayEdit, WikiFrame } from "./types";

// Recorded through real Kafka; timestamps and offsets are never fabricated.
export const previewCapturedAt = capture.capturedAt;
export const previewEdits = capture.edits as DisplayEdit[];
export const previewFrame = capture.frame as WikiFrame;
