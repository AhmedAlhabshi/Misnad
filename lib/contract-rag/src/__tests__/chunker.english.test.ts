import assert from "node:assert/strict";
import { chunkContractText } from "../chunk/chunker";

export function run(): void {
  // 1. English Section/Clause/Article headings each become their own ordered chunk.
  {
    const text = [
      "Section 1: Definitions",
      "\"Lessee\" means the party leasing the vehicle under this agreement.",
      "",
      "Clause 2: Monthly Payment",
      "The Lessee shall pay 1,500 SAR per month on the first business day of each month.",
      "",
      "Article 3: Early Termination",
      "Either party may terminate this agreement early with 30 days written notice.",
    ].join("\n");

    const chunks = chunkContractText(text, { sessionId: "s1" });
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].section, "Section 1");
    assert.equal(chunks[1].section, "Clause 2");
    assert.equal(chunks[2].section, "Article 3");
    assert.ok(chunks[1].text.includes("1,500 SAR"), "chunk body must preserve source wording exactly");
    assert.deepEqual(
      chunks.map((c) => c.chunkOrder),
      [0, 1, 2],
    );
  }
  console.log("PASS English Section/Clause/Article headings each become their own ordered chunk");

  // 2. Generic numbered clause markers ("1.", "2)") are detected when no keyword heading is present.
  {
    const text = ["1. The borrower shall repay the principal in 48 equal monthly installments.", "", "2) A late fee of 100 SAR applies to any payment more than 5 days overdue."].join(
      "\n",
    );
    const chunks = chunkContractText(text, { sessionId: "s2" });
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].section, "1");
    assert.equal(chunks[1].section, "2");
    assert.ok(chunks[1].text.includes("100 SAR"));
  }
  console.log("PASS generic numbered clause markers are detected as section headings");

  // 3. No heading fabricated: heading-less English text falls back to paragraph splitting, flagged for review.
  {
    const text = "This is a contract with no headings or numbered clauses at all, just one continuous paragraph of general terms.";
    const chunks = chunkContractText(text, { sessionId: "s3" });
    assert.ok(chunks.length >= 1);
    for (const chunk of chunks) {
      assert.equal(chunk.section, null);
      assert.equal(chunk.needsManualReview, true);
    }
  }
  console.log("PASS heading-less English text falls back to paragraph splitting without inventing a section label");

  console.log("PASS chunker.english.test.ts");
}

run();
