import assert from "node:assert/strict";
import { chunkContractText } from "../chunk/chunker";

export function run(): void {
  // 1. Arabic ordinal enumeration headings (أولاً/ثانياً) each become their own chunk, in order.
  {
    const text = [
      "أولاً: تعريفات",
      "يقصد بالعقد الاتفاقية المبرمة بين الطرفين.",
      "",
      "ثانياً: الالتزامات المالية",
      "يلتزم المستأجر بدفع 2000 ريال شهرياً في موعد أقصاه اليوم الخامس من كل شهر.",
      "",
      "ثالثاً: مدة العقد",
      "مدة هذا العقد سنة واحدة قابلة للتجديد.",
    ].join("\n");

    const chunks = chunkContractText(text, { sessionId: "s1" });
    assert.equal(chunks.length, 3, "each Arabic ordinal heading must produce exactly one chunk");
    assert.equal(chunks[0].section, "أولاً");
    assert.equal(chunks[1].section, "ثانياً");
    assert.equal(chunks[2].section, "ثالثاً");
    assert.ok(chunks[1].text.includes("2000 ريال"), "chunk body must preserve the source wording exactly");
    assert.deepEqual(
      chunks.map((c) => c.chunkOrder),
      [0, 1, 2],
      "chunk order must be stable and sequential",
    );
    for (const chunk of chunks) {
      assert.equal(chunk.needsManualReview, false, "a chunk produced from a detected heading must not be flagged for manual review");
    }
  }
  console.log("PASS Arabic ordinal enumeration headings each become their own ordered chunk");

  // 2. المادة / البند headings are detected and the article/clause number is preserved as the section label.
  {
    const text = ["المادة 5: التأمين", "يلتزم الطرف الأول بتوفير تأمين شامل على المركبة طوال مدة العقد.", "", "البند 6: الإنهاء المبكر", "يجوز إنهاء العقد مبكراً بإشعار مدته 30 يوماً."].join(
      "\n",
    );

    const chunks = chunkContractText(text, { sessionId: "s2" });
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].section, "المادة 5");
    assert.equal(chunks[1].section, "البند 6");
    assert.ok(chunks[0].text.includes("تأمين شامل"));
    assert.ok(chunks[1].text.includes("30 يوماً"));
  }
  console.log("PASS المادة/البند headings are detected with their number preserved as the section label");

  // 3. No heading fabricated: a heading-less Arabic paragraph never gets an invented section label.
  {
    const text = "هذا نص عقد بدون أي عناوين أو بنود مرقمة على الإطلاق. مجرد فقرة واحدة تحتوي على بعض التفاصيل العامة.";
    const chunks = chunkContractText(text, { sessionId: "s3" });
    assert.ok(chunks.length >= 1);
    for (const chunk of chunks) {
      assert.equal(chunk.section, null, "a chunk from the paragraph fallback must never invent a section label");
      assert.equal(chunk.needsManualReview, true, "the paragraph-fallback path must flag its chunks for manual review");
    }
  }
  console.log("PASS heading-less Arabic text falls back to paragraph splitting without inventing a section label");

  console.log("PASS chunker.arabic.test.ts");
}

run();
