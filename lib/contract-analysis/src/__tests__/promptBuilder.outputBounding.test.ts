import assert from "node:assert/strict";
import { SYSTEM_INSTRUCTIONS, buildCorrectionPrompt } from "../promptBuilder";

export function run(): void {
  // c. Prompt explicitly limits large arrays and asks for material information only.
  assert.ok(
    SYSTEM_INSTRUCTIONS.includes("BE CONCISE AND MATERIAL"),
    "the prompt must explicitly instruct material, non-exhaustive extraction",
  );
  const arrayLimits: Array<[string, number]> = [
    ["parties", 6],
    ["financialObligations", 12],
    ["dates", 12],
    ["penalties", 10],
    ["fees", 10],
    ["importantClauses", 30],
    ["extractedNumbers", 20],
    ["missingInformation", 15],
  ];
  for (const [field, limit] of arrayLimits) {
    assert.ok(
      SYSTEM_INSTRUCTIONS.includes(`"${field}" ≤ ${limit} items`),
      `the prompt must explicitly state the ${limit}-item limit for "${field}"`,
    );
  }
  assert.ok(
    /select the most materially important ones/i.test(SYSTEM_INSTRUCTIONS),
    "the prompt must instruct selection by materiality, not first appearance",
  );

  const textLimits = [
    '"contractSummary" ≤ 500',
    '"contractSummarySimple" ≤ 350',
    'role" ≤ 100',
    'notes" ≤ 300',
    "fields ≤ 250",
    'title" ≤ 180',
    'summary" ≤ 500',
    'plainExplanation" ≤ 350',
    'evidence" ≤ 350',
    'condition" ≤ 600',
    "missingInformation.reason\" ≤ 300",
    'extractionNotes" ≤ 700',
  ];
  for (const fragment of textLimits) {
    assert.ok(
      SYSTEM_INSTRUCTIONS.includes(fragment),
      `the prompt must state the text-length limit fragment: "${fragment}"`,
    );
  }

  // d. Prompt excludes irrelevant legal/reference numbers from extractedNumbers.
  assert.ok(/royal decree numbers/i.test(SYSTEM_INSTRUCTIONS));
  assert.ok(/circular numbers/i.test(SYSTEM_INSTRUCTIONS));
  assert.ok(/article numbering/i.test(SYSTEM_INSTRUCTIONS));
  assert.ok(/page numbers/i.test(SYSTEM_INSTRUCTIONS));
  assert.ok(
    /document\/reference IDs/i.test(SYSTEM_INSTRUCTIONS),
    "the prompt must exclude document/reference IDs from extractedNumbers",
  );

  // e. Prompt states missingInformation must not enumerate every null field.
  assert.ok(
    /do not add a "missinginformation" entry for every null property/i.test(SYSTEM_INSTRUCTIONS),
    "the prompt must explicitly forbid a missingInformation entry per null field",
  );
  assert.ok(
    /prefer simply leaving a "typedetails" field as null/i.test(SYSTEM_INSTRUCTIONS),
    "the prompt must prefer null typeDetails fields over missingInformation entries",
  );

  // Evidence extraction is deferred this milestone: evidence must always be null.
  assert.ok(
    /the "evidence" field MUST be null for now/i.test(SYSTEM_INSTRUCTIONS),
    "the prompt must explicitly require importantClauses[].evidence to be null for now",
  );
  assert.ok(
    /evidence extraction is deferred for this milestone/i.test(SYSTEM_INSTRUCTIONS),
    "the prompt must explain that evidence extraction is deferred for this milestone",
  );
  assert.ok(
    /do not attempt to extract, paraphrase, reconstruct, or generate any excerpt/i.test(SYSTEM_INSTRUCTIONS),
    "the prompt must explicitly forbid extracting, paraphrasing, reconstructing, or generating evidence",
  );
  assert.ok(
    /always set "evidence" to null for every clause/i.test(SYSTEM_INSTRUCTIONS),
    "the prompt must explicitly instruct setting evidence to null for every clause",
  );

  // Generic (contract-type-agnostic) content-understanding instructions for
  // the new contractSummary/contractSummarySimple/plainExplanation fields —
  // must describe the concept, not any specific contract type's content.
  assert.ok(
    /explaining, in plain language, what kind of contractual relationship/i.test(SYSTEM_INSTRUCTIONS),
    'the prompt must instruct a generic, contract-type-agnostic "contractSummary" explanation',
  );
  assert.ok(
    /not a financial summary/i.test(SYSTEM_INSTRUCTIONS),
    "the prompt must explicitly forbid a financial-dashboard framing for contractSummary",
  );
  assert.ok(
    /simplest possible everyday language/i.test(SYSTEM_INSTRUCTIONS),
    'the prompt must instruct "contractSummarySimple" to use the simplest everyday language',
  );
  assert.ok(
    /"plainExplanation" must explain the practical, everyday meaning/i.test(SYSTEM_INSTRUCTIONS),
    'the prompt must instruct a per-clause "plainExplanation" distinct from "summary"',
  );
  assert.ok(
    /not a repeat of "summary"/i.test(SYSTEM_INSTRUCTIONS),
    'the prompt must explicitly forbid "plainExplanation" from repeating "summary"',
  );
  // These instructions must not bake in a worked example sentence for any one contract type.
  for (const workedExample of ["auto finance", "vehicle ownership", "financing agreement", "هذا عقد تمويل"]) {
    assert.equal(
      SYSTEM_INSTRUCTIONS.toLowerCase().includes(workedExample.toLowerCase()),
      false,
      `the generic contractSummary/plainExplanation instructions must not bake in a worked example like "${workedExample}"`,
    );
  }

  // The Overview tab must show every meaningful clause, not a curated
  // subset — the prompt must instruct full, generic coverage (never a fixed
  // hardcoded category checklist) and explicitly forbid artificially
  // limiting to a small "top" handful when more genuinely exist.
  assert.ok(
    /"importantClauses" must include EVERY distinct clause actually present/i.test(SYSTEM_INSTRUCTIONS),
    "the prompt must instruct exhaustive, generic clause coverage",
  );
  assert.ok(
    /do not artificially limit yourself to a small handful of "top" clauses/i.test(SYSTEM_INSTRUCTIONS),
    "the prompt must explicitly forbid artificially limiting clause coverage",
  );
  assert.ok(
    /only illustrative examples, not a fixed checklist/i.test(SYSTEM_INSTRUCTIONS),
    "the prompt must clarify the example clause types are illustrative, not a hardcoded category list",
  );

  // Correction prompt: completion-priority instructions.
  const correction = buildCorrectionPrompt({
    maskedText: "masked contract text",
    contractType: "other",
    analysisLanguage: "ar",
    previousResponseText: "{}",
    validationErrorSummary: "- (root): some issue",
  });

  assert.ok(/FULL corrected JSON object/i.test(correction));
  assert.ok(/never stop partway through/i.test(correction));
  assert.ok(/remove low-value, repetitive, or less material items/i.test(correction));
  assert.ok(/Do not add commentary, explanations, or Markdown/i.test(correction));
  assert.ok(/Prioritize completing a valid, well-formed JSON object/i.test(correction));

  console.log("PASS promptBuilder.outputBounding.test.ts");
}

run();
