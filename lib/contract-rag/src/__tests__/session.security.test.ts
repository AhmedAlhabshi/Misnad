import assert from "node:assert/strict";
import { generateContractRagSessionId, isValidContractRagSessionIdFormat } from "../session/sessionId";

export function run(): void {
  // 1. Generated ids are unique and never sequential/predictable.
  const ids = new Set<string>();
  for (let i = 0; i < 1000; i += 1) {
    ids.add(generateContractRagSessionId());
  }
  assert.equal(ids.size, 1000, "1000 generated session ids must all be distinct");
  console.log("PASS generated session ids are unique across 1000 samples");

  // 2. Every generated id is exactly the expected base64url shape/length (256 bits -> 43 chars, no padding).
  {
    const id = generateContractRagSessionId();
    assert.match(id, /^[A-Za-z0-9_-]{43}$/, "a generated id must be 43 base64url characters with no padding");
    assert.ok(!id.includes("="), "a base64url session id must never contain padding");
  }
  console.log("PASS generated session id has the expected base64url shape and length");

  // 3. Every generated id round-trips through the format validator.
  for (let i = 0; i < 20; i += 1) {
    assert.ok(isValidContractRagSessionIdFormat(generateContractRagSessionId()));
  }
  console.log("PASS every generated session id passes format validation");

  // 4. Malformed/SQL-shaped/absurd-length input is rejected before ever reaching a query.
  const rejected = [
    "",
    "short",
    "a".repeat(10),
    "a".repeat(200),
    "'; DROP TABLE contract_rag_sessions; --",
    "not base64url !!!",
    "12345",
    null,
    undefined,
    123,
    {},
  ];
  for (const value of rejected) {
    assert.equal(isValidContractRagSessionIdFormat(value), false, `expected rejection for ${JSON.stringify(value)}`);
  }
  console.log("PASS malformed, SQL-shaped, and non-string input is rejected by format validation");

  console.log("PASS session.security.test.ts");
}

run();
