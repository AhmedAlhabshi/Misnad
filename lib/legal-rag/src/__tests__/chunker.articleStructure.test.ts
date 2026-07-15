import assert from "node:assert/strict";
import { chunkLegalText, type ChunkSourceMeta } from "../chunk/chunker";

function meta(overrides: Partial<ChunkSourceMeta> = {}): ChunkSourceMeta {
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
    ...overrides,
  };
}

export function run(): void {
  // --- English article-based chunking ---
  {
    const text = `Article 9: Fees and Charges

All fees, costs and administrative services charges to be recovered from the Borrower must not exceed 1%.

Article 11: Early Payments

The Borrower may prepay at any time without incurring any Term Cost for the remaining period.`;
    const chunks = chunkLegalText(text, meta());

    assert.equal(chunks.length, 2, "two distinct articles must produce exactly two chunks");
    assert.equal(chunks[0].articleNumber, "Article 9");
    assert.ok(chunks[0].text.includes("Fees and Charges"));
    assert.ok(chunks[0].text.includes("must not exceed 1%"));
    assert.equal(chunks[1].articleNumber, "Article 11");
    assert.ok(chunks[1].text.includes("Early Payments"));
    assert.ok(!chunks[0].text.includes("Early Payments"), "Article 9's chunk must never contain Article 11's text");
    assert.ok(!chunks[1].text.includes("Fees and Charges"), "Article 11's chunk must never contain Article 9's text");
    assert.equal(chunks[0].needsManualReview, false);
    assert.equal(chunks[1].needsManualReview, false);
  }
  console.log("PASS English 'Article N' headings split into distinct, non-merged chunks");

  // --- Arabic (المادة) article-based chunking ---
  {
    const text = `المادة 9: الرسوم والمصاريف

يجب ألا تتجاوز جميع الرسوم والتكاليف المستحقة على المقترض نسبة 1% من مبلغ التمويل.

المادة 11: السداد المبكر

يجوز للمقترض سداد المبلغ المتبقي في أي وقت دون تحمل أي تكلفة أجل عن الفترة المتبقية.`;
    const chunks = chunkLegalText(text, meta({ language: "ar" }));

    assert.equal(chunks.length, 2, "two distinct Arabic articles must produce exactly two chunks");
    assert.equal(chunks[0].articleNumber, "المادة 9");
    assert.ok(chunks[0].text.includes("الرسوم والمصاريف"));
    assert.equal(chunks[1].articleNumber, "المادة 11");
    assert.ok(chunks[1].text.includes("السداد المبكر"));
    assert.ok(!chunks[0].text.includes("السداد المبكر"), "an Arabic article's chunk must never bleed into the next article's text");
    assert.equal(chunks[0].needsManualReview, false);
  }
  console.log("PASS Arabic 'المادة N' headings split into distinct, non-merged chunks");

  // --- Chapter/section heading is attached to the following article ---
  {
    const text = `Section Two - Financing Contracts

Article 9: Fees and Charges

Body text here.`;
    const chunks = chunkLegalText(text, meta());
    assert.equal(chunks[0].chapterSection, "Section Two - Financing Contracts");
  }
  console.log("PASS a chapter/section heading is attached to the article that follows it");

  // --- Paragraph-level fallback, flagged for manual review ---
  {
    const text = `This is a plain document with no article numbering at all.

It has multiple paragraphs separated by blank lines.

Each paragraph should become its own chunk, but none of them can be trusted as properly structured.`;
    const chunks = chunkLegalText(text, meta());

    assert.equal(chunks.length, 3, "each blank-line-separated paragraph becomes its own fallback chunk");
    for (const chunk of chunks) {
      assert.equal(chunk.articleNumber, null, "a fallback chunk must never fabricate an article number");
      assert.equal(chunk.needsManualReview, true, "every fallback chunk must be flagged for manual review");
    }
  }
  console.log("PASS text with no article structure falls back to flagged, per-paragraph chunks");

  // --- Chunk order is sequential and stable ---
  {
    const text = `Article 1: First

Body one.

Article 2: Second

Body two.

Article 3: Third

Body three.`;
    const chunks = chunkLegalText(text, meta());
    assert.deepEqual(chunks.map((c) => c.chunkOrder), [0, 1, 2]);
  }
  console.log("PASS chunk order is sequential across multiple articles");

  console.log("PASS chunker.articleStructure.test.ts");
}

run();
