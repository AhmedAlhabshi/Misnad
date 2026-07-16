import assert from "node:assert/strict";
import { normalizeQuestion } from "../normalize/normalizeQuestion";

export async function run(): Promise<void> {
  // --- Arabic diacritics and punctuation are stripped, spelling variants folded ---
  {
    const withDiacritics = normalizeQuestion("هَلْ يَحِقُّ لِلْمُؤَجِّرِ إِخْلَائِي؟");
    const withoutDiacritics = normalizeQuestion("هل يحق للمؤجر إخلائي؟");
    assert.equal(withDiacritics, withoutDiacritics, "diacritic marks must not change the normalized form");
    assert.ok(!withDiacritics.includes("؟"), "Arabic question mark must be stripped");
  }
  console.log("PASS Arabic diacritics fold to the same normalized form as undiacritized text");

  // --- Arabic tanween-ordering variants fold identically ---
  {
    const a = normalizeQuestion("هل هذا مسموح نظاميًا؟");
    const b = normalizeQuestion("هل هذا مسموح نظاميا؟");
    assert.equal(a, b, "tanween-mark ordering must not change the normalized form");
  }
  console.log("PASS Arabic tanween-mark ordering variants normalize identically");

  // --- English casing is folded ---
  {
    const upper = normalizeQuestion("WHAT DOES MY CONTRACT SAY ABOUT EARLY TERMINATION?");
    const lower = normalizeQuestion("what does my contract say about early termination?");
    assert.equal(upper, lower, "casing must not change the normalized form");
    assert.ok(!upper.includes("?"), "Latin question mark must be stripped");
  }
  console.log("PASS English casing folds to a single normalized form and strips punctuation");

  // --- Mixed Arabic/English financial terminology survives normalization without corruption ---
  {
    const mixed = normalizeQuestion("What is the APR على قسطي الشهري؟");
    assert.ok(mixed.includes("apr"), "Latin terms inside a mixed-language question must survive normalization");
    assert.ok(mixed.includes("قسطي"), "Arabic terms inside a mixed-language question must survive normalization");
  }
  console.log("PASS mixed Arabic/English financial terminology is preserved through normalization");

  // --- Whitespace collapses ---
  {
    const spaced = normalizeQuestion("  what   does   my   contract   say?  ");
    assert.equal(spaced, "what does my contract say");
  }
  console.log("PASS excess whitespace collapses to single spaces and is trimmed");

  console.log("PASS normalize.test.ts");
}

run();
