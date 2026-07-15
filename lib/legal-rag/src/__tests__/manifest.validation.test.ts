import assert from "node:assert/strict";
import { isAllowedOfficialUrl, legalSourceDocumentSchema, type LegalSourceDocument } from "../manifest/schema";
import { LEGAL_SOURCE_MANIFEST, validateManifest } from "../manifest";

function validEntry(overrides: Partial<LegalSourceDocument> = {}): LegalSourceDocument {
  return {
    sourceId: "test_source",
    collectionId: "test_collection",
    authority: "sama",
    documentTitleAr: "عنوان تجريبي",
    documentTitleEn: "Test Title",
    documentType: "circular",
    officialSourceUrl: "https://rulebook.sama.gov.sa/en/some-article",
    contractTypes: ["auto_finance"],
    topics: ["fees"],
    jurisdiction: "SA",
    publicationDate: "2020-01-01",
    effectiveDate: "2020-01-01",
    lastVerifiedAt: "2026-07-15",
    status: "active",
    language: "en",
    version: "v1",
    ingestionPath: "legal-sources/sama/test.txt",
    ...overrides,
  };
}

export function run(): void {
  // --- The real, populated manifest must itself be valid end-to-end ---
  {
    const result = validateManifest(LEGAL_SOURCE_MANIFEST);
    assert.equal(result.valid, true, `the real manifest must validate cleanly: ${result.errors.join("; ")}`);
    assert.ok(LEGAL_SOURCE_MANIFEST.length >= 2, "at least the 2 SAMA sources must be present");
  }
  console.log("PASS the real curated manifest validates cleanly against its own schema");

  // --- A structurally valid entry parses ---
  {
    const result = legalSourceDocumentSchema.safeParse(validEntry());
    assert.equal(result.success, true);
  }
  console.log("PASS a structurally valid manifest entry parses");

  // --- Official-domain allow-list ---
  {
    assert.equal(isAllowedOfficialUrl("https://rulebook.sama.gov.sa/en/article-9-fees-and-charges"), true);
    assert.equal(isAllowedOfficialUrl("https://sama.gov.sa/some/pdf.pdf"), true);
    assert.equal(isAllowedOfficialUrl("https://some-law-firm-blog.com/sama-summary"), false, "an unofficial domain must never pass");
    assert.equal(isAllowedOfficialUrl("https://news-site.example/article"), false);
    assert.equal(isAllowedOfficialUrl("not a url"), false, "a malformed URL must never pass");
  }
  console.log("PASS official-domain allow-list accepts only approved government domains");

  // --- An entry citing an unofficial URL is rejected by the schema itself, not just the allow-list function ---
  {
    const result = legalSourceDocumentSchema.safeParse(validEntry({ officialSourceUrl: "https://some-law-firm-blog.com/summary" }));
    assert.equal(result.success, false, "the schema must reject an unofficial officialSourceUrl, not just flag it separately");
  }
  console.log("PASS the manifest schema itself rejects an unofficial source URL");

  // --- Duplicate sourceId rejection ---
  {
    const duplicated = [validEntry({ sourceId: "dup" }), validEntry({ sourceId: "dup" })];
    const result = validateManifest(duplicated);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("duplicate sourceId: dup")));
  }
  console.log("PASS duplicate sourceId is rejected by manifest validation");

  // --- An invalid entry (missing required field via bad type) is reported with its sourceId ---
  {
    const invalid = { ...validEntry({ sourceId: "bad_entry" }), documentType: "not_a_real_type" };
    const result = validateManifest([invalid as unknown as LegalSourceDocument]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.startsWith("bad_entry:")));
  }
  console.log("PASS an invalid manifest entry is reported by sourceId");

  console.log("PASS manifest.validation.test.ts");
}

run();
