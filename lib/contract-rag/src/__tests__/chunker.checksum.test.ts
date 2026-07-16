import assert from "node:assert/strict";
import { computeChunkChecksum } from "../chunk/checksum";
import { chunkContractText } from "../chunk/chunker";

export function run(): void {
  // 1. Checksum is a pure function of the text: identical text -> identical checksum, different text -> different checksum.
  {
    const a = computeChunkChecksum("Section 1: identical text across two runs");
    const b = computeChunkChecksum("Section 1: identical text across two runs");
    const c = computeChunkChecksum("Section 1: a different chunk entirely");
    assert.equal(a, b, "identical chunk text must always produce the identical checksum");
    assert.notEqual(a, c, "different chunk text must produce a different checksum");
  }
  console.log("PASS checksum is a stable, content-derived function of chunk text");

  // 2. Re-chunking the exact same document twice is fully deterministic: same order, same checksums, same section labels.
  {
    const text = ["Section 1: Alpha", "First body text.", "", "Section 2: Beta", "Second body text.", "", "Section 3: Gamma", "Third body text."].join("\n");

    const run1 = chunkContractText(text, { sessionId: "same-session" });
    const run2 = chunkContractText(text, { sessionId: "same-session" });

    assert.deepEqual(
      run1.map((c) => c.chunkOrder),
      run2.map((c) => c.chunkOrder),
      "chunk order must be stable across repeated runs on identical input",
    );
    assert.deepEqual(
      run1.map((c) => c.checksum),
      run2.map((c) => c.checksum),
      "chunk checksums must be stable across repeated runs on identical input",
    );
    assert.deepEqual(
      run1.map((c) => c.section),
      run2.map((c) => c.section),
    );
  }
  console.log("PASS re-chunking identical input twice yields identical order and checksums");

  // 3. Every chunk's own checksum matches computeChunkChecksum(chunk.text) exactly.
  {
    const text = "Section 1: Check\nThis is the body of the only section.";
    const chunks = chunkContractText(text, { sessionId: "s" });
    for (const chunk of chunks) {
      assert.equal(chunk.checksum, computeChunkChecksum(chunk.text), "a chunk's stored checksum must match its own text's checksum");
    }
  }
  console.log("PASS every chunk's checksum matches its own text");

  console.log("PASS chunker.checksum.test.ts");
}

run();
