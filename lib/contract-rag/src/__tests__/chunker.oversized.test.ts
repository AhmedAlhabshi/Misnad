import assert from "node:assert/strict";
import { chunkContractText } from "../chunk/chunker";

function paragraph(label: string, length: number): string {
  return `${label} ${"x".repeat(Math.max(0, length - label.length - 1))}`;
}

export function run(): void {
  // 1. An oversized section (well beyond the ~2000-char soft cap) is safely sub-split at paragraph boundaries.
  {
    const paragraphs = [paragraph("P1", 700), paragraph("P2", 700), paragraph("P3", 700), paragraph("P4", 700), paragraph("P5", 700)];
    const text = ["Section 1: Big Section", "", paragraphs.join("\n\n"), "", "Section 2: Next Section", "", "This section must never absorb any content from Section 1."].join(
      "\n",
    );

    const chunks = chunkContractText(text, { sessionId: "s1" });
    const section1Chunks = chunks.filter((c) => c.section === "Section 1");
    const section2Chunks = chunks.filter((c) => c.section === "Section 2");

    assert.ok(section1Chunks.length > 1, "an oversized section must be sub-split into multiple chunks");
    console.log("PASS an oversized section is sub-split into multiple chunks");

    // Chunk order is stable and sequential across the whole document, including sub-splits.
    const orders = chunks.map((c) => c.chunkOrder);
    const sortedOrders = [...orders].sort((a, b) => a - b);
    assert.deepEqual(orders, sortedOrders, "chunk order must be non-decreasing across sub-split chunks");
    assert.deepEqual(orders, Array.from({ length: orders.length }, (_, i) => i), "chunk order must be sequential with no gaps");
    console.log("PASS chunk order remains stable and sequential across sub-splits");

    // Bounded overlap: consecutive sub-chunks of the SAME section share a short trailing/leading overlap,
    // never a full duplication of the previous chunk's content.
    for (let i = 0; i < section1Chunks.length - 1; i += 1) {
      const tail = section1Chunks[i].text.slice(-100);
      assert.ok(section1Chunks[i + 1].text.startsWith(tail), "a bounded trailing overlap must carry from one sub-chunk into the next within the same section");
      assert.notEqual(section1Chunks[i + 1].text, section1Chunks[i].text, "consecutive sub-chunks must never be exact duplicates");
      const fullConcatenation = paragraphs.join("\n\n");
      assert.ok(section1Chunks[i + 1].text.length < fullConcatenation.length, "a sub-chunk must never contain the entire oversized section's text");
    }
    console.log("PASS a bounded overlap carries between consecutive sub-chunks of the same oversized section");

    // Overlap never bleeds into a different section: Section 2's chunk must not contain Section 1's paragraph markers.
    assert.equal(section2Chunks.length, 1);
    assert.ok(!section2Chunks[0].text.includes("P5"), "sub-split overlap must never cross into a different section");
    console.log("PASS oversized sub-split overlap never crosses into a different section");

    // No chunk is a tiny unusable fragment.
    for (const chunk of chunks) {
      assert.ok(chunk.text.trim().length >= 20, "no chunk may be a tiny unusable fragment");
    }
    console.log("PASS no chunk produced is a tiny unusable fragment");
  }

  console.log("PASS chunker.oversized.test.ts");
}

run();
