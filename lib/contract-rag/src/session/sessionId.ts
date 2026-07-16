import { randomBytes } from "node:crypto";

/** 256 bits of entropy — a temporary capability token, not a login credential, but still sufficiently unpredictable that guessing or enumerating a live session is infeasible. */
const SESSION_ID_BYTES = 32;

/** base64url of 32 random bytes is 43 characters with no padding; the range gives headroom without accepting an arbitrary-length string. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

/** Generates a new opaque Contract RAG session id — never a sequential database id, never derived from user- or contract-identifiable data. */
export function generateContractRagSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString("base64url");
}

/**
 * Validates a client-supplied session id is *shaped* like one of ours
 * before it ever reaches a database query — a malformed id (wrong charset,
 * absurd length, SQL-shaped input) is rejected here, not passed through to
 * a parameterized query and merely "not found".
 */
export function isValidContractRagSessionIdFormat(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}
