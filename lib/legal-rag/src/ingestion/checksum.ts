import { createHash } from "node:crypto";

/**
 * Stable content hash for a chunk's text. Used to detect "this exact
 * article's text didn't change since the last ingestion" so re-ingestion
 * can skip re-embedding unchanged chunks (§ ingestion workflow).
 */
export function computeChecksum(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
