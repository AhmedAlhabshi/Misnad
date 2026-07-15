import assert from "node:assert/strict";
import { computeChecksum } from "../ingestion/checksum";
import { chunkLegalText, type ChunkSourceMeta } from "../chunk/chunker";

function meta(): ChunkSourceMeta {
  return {
    sourceId: "test_source",
    authority: "sama",
    documentTitle: "Test Document",
    contractTypes: ["auto_finance"],
    topics: ["fees"],
    language: "en",
    status: "active",
    effectiveDate: "2020-01-01",
    officialSourceUrl: "https://rulebook.sama.gov.sa/en/test",
  };
}

export function run(): void {
  // --- The same text always produces the same checksum ---
  {
    const a = computeChecksum("All fees must not exceed 1%.");
    const b = computeChecksum("All fees must not exceed 1%.");
    assert.equal(a, b, "identical text must produce an identical checksum");
  }
  console.log("PASS computeChecksum is stable for identical text");

  // --- Different text produces a different checksum ---
  {
    const a = computeChecksum("All fees must not exceed 1%.");
    const b = computeChecksum("All fees must not exceed 2%.");
    assert.notEqual(a, b, "even a one-character difference must change the checksum");
  }
  console.log("PASS computeChecksum changes when the text changes");

  // --- Re-chunking identical raw text twice produces identical chunk checksums (and identical chunkIds) ---
  {
    const text = `Article 9: Fees and Charges

All fees must not exceed 1%.`;
    const first = chunkLegalText(text, meta());
    const second = chunkLegalText(text, meta());

    assert.equal(first.length, second.length);
    assert.equal(first[0].checksum, second[0].checksum, "re-chunking identical text must produce an identical checksum for the same article");
    assert.equal(first[0].chunkId, second[0].chunkId, "re-chunking identical text must produce an identical, stable chunkId");
  }
  console.log("PASS re-chunking identical raw text yields stable checksums and chunkIds across runs");

  // --- Changing only one article's text changes only that article's checksum, not its sibling's ---
  {
    const before = chunkLegalText(
      `Article 9: Fees and Charges\n\nAll fees must not exceed 1%.\n\nArticle 11: Early Payments\n\nNo term cost applies.`,
      meta(),
    );
    const after = chunkLegalText(
      `Article 9: Fees and Charges\n\nAll fees must not exceed 2%.\n\nArticle 11: Early Payments\n\nNo term cost applies.`,
      meta(),
    );

    assert.notEqual(before[0].checksum, after[0].checksum, "Article 9's checksum must change when its own text changes");
    assert.equal(before[1].checksum, after[1].checksum, "Article 11's checksum must stay identical when only Article 9's text changed");
  }
  console.log("PASS changing one article's text never changes an unrelated article's checksum");

  console.log("PASS chunker.checksum.test.ts");
}

run();
