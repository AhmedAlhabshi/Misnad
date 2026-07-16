import { createHash } from "node:crypto";

/** Stable content hash for a chunk's text — used to keep chunk identity/order deterministic across re-runs on identical input. */
export function computeChunkChecksum(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
