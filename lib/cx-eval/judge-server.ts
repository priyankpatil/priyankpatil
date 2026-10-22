// Server-only entry to the pipeline's judge client, so app code imports it from
// one place. The pipeline modules use explicit .ts import extensions, which
// Next resolves because tsconfig sets allowImportingTsExtensions.
export { judgeConversation, promptHash } from "@/pipelines/cx-eval/src/judge/judge.ts";
