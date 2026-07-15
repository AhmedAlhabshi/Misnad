import assert from "node:assert/strict";
import { inferConditionalFromText, inferMandatoryFromText, inferPaymentTimingFromText, inferRefundableFromText } from "../pipeline/classify";

export function run(): void {
  // A plainly-worded fee with no explicit mandatory/optional/conditional verb now defaults to mandatory:
  // true — this is the fix for the 144,000 vs 145,200 SAR bug (a real, named fee silently vanishing
  // from every cost total because "mandatory" resolved to null instead of true).
  assert.equal(
    inferMandatoryFromText("Administrative fee: 1,200 SAR"),
    true,
    "a plainly-worded fee with no trigger verb must default to mandatory",
  );
  assert.equal(
    inferMandatoryFromText("رسوم إدارية: 1,200 ريال"),
    true,
    "the same default must apply in Arabic text",
  );
  console.log("PASS inferMandatoryFromText defaults an ambiguous plainly-worded fee to mandatory:true");

  // Explicit mandatory/optional wording still resolves exactly as before.
  assert.equal(inferMandatoryFromText("This fee is mandatory."), true);
  assert.equal(inferMandatoryFromText("This fee is optional."), false);
  console.log("PASS inferMandatoryFromText still honors explicit mandatory/optional wording");

  // Conditional/event-triggered wording must NOT default to mandatory:true — it stays null/unstated,
  // and is separately marked conditional:true by inferConditionalFromText, so it is excluded from the
  // guaranteed bucket regardless of what mandatory resolves to.
  const conditionalExamples = [
    "A late fee applies if payment is overdue.",
    "An early termination fee may apply.",
    "A collection cost applies upon default.",
    "غرامة تأخير في حال التأخر عن السداد.",
  ];
  for (const text of conditionalExamples) {
    assert.equal(inferMandatoryFromText(text), null, `conditional wording must not default to mandatory: "${text}"`);
    assert.equal(inferConditionalFromText(text), true, `conditional wording must be flagged conditional: "${text}"`);
  }
  console.log("PASS inferMandatoryFromText never defaults conditional/event-triggered wording to mandatory");

  // A refundable security deposit is still a real, guaranteed upfront payment (mandatory:true) — its
  // refundability is a separate, orthogonal classification handled by inferRefundableFromText.
  const depositText = "Security deposit: 5,000 SAR (refundable at the end of the lease).";
  assert.equal(inferMandatoryFromText(depositText), true, "a refundable deposit is still mandatory — it must genuinely be paid up front");
  assert.equal(inferRefundableFromText(depositText), true, "the deposit's refundability must be tracked separately from its mandatory status");
  console.log("PASS a refundable deposit resolves mandatory:true and refundable:true independently");

  // A bare timing preposition ("upon"/"عند") must NOT, on its own, be read as a conditional/event
  // trigger — it is a temporal preposition that appears just as often in a plain statement of WHEN a
  // guaranteed payment is due (e.g. "due upon signing") as in a true conditional clause. Real trigger
  // words ("if", "late", "penalty", "termination", ...) already cover genuine conditionality on their own.
  const dueAtSigningExamples = [
    "Administrative fee: 1,200 SAR, payable upon signing the contract.",
    "رسوم إدارية إلزامية: 1,200 ريال، تُدفع عند توقيع العقد.",
  ];
  for (const text of dueAtSigningExamples) {
    assert.notEqual(inferConditionalFromText(text), true, `"due upon/عند signing" wording must not be read as conditional: "${text}"`);
    assert.equal(inferMandatoryFromText(text), true, `"due upon/عند signing" wording must still default to mandatory: "${text}"`);
    assert.equal(inferPaymentTimingFromText(text), "due_now", `"due upon/عند signing" wording must resolve payment timing to due_now: "${text}"`);
  }
  console.log("PASS a bare 'upon'/'عند' timing preposition is never read as a conditional trigger, and 'due at signing' wording resolves timing to due_now");

  // A final/balloon payment due at the end of the term must resolve to due_later, never due_now, purely
  // from its own timing wording — never inferred from it being one-time or from its obligation type.
  assert.equal(
    inferPaymentTimingFromText("Final payment of 19,200 SAR due at the end of the financing term."),
    "due_later",
    "a payment explicitly due at the end of the term must resolve to due_later",
  );
  assert.equal(
    inferPaymentTimingFromText("دفعة ختامية قدرها 19,200 ريال تُستحق في نهاية مدة التمويل."),
    "due_later",
    "the same must hold for the Arabic equivalent",
  );
  console.log("PASS a final/balloon payment's own 'due at the end of the term' wording resolves to due_later");

  // Genuinely unstated timing must resolve to null — never assumed due_now just because the amount is
  // one-time and mandatory.
  assert.equal(
    inferPaymentTimingFromText("Administrative fee: 1,200 SAR"),
    null,
    "an amount with no stated timing at all must resolve to unknown (null), never assumed due_now",
  );
  console.log("PASS an amount with genuinely unstated timing resolves to null, never assumed due_now");

  console.log("PASS pipeline.classify.test.ts");
}

run();
