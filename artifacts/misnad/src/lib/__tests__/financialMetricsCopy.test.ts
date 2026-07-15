import assert from "node:assert/strict";
import {
  FEE_TYPE_VALUES,
  OBLIGATION_TYPE_VALUES,
  PAYMENT_FREQUENCY_VALUES,
  PENALTY_TYPE_VALUES,
} from "@workspace/financial-metrics";
import { FINANCIAL_METRICS_COPY, getCanonicalConceptLabel } from "../financialMetricsCopy";

/** Every id in `financialConcepts.ts`'s closed `CanonicalConceptId` enum — kept as a literal list here (rather than importing the type) so this test independently proves the label dictionary is exhaustive. */
const ALL_CANONICAL_CONCEPT_IDS = [
  "monthly_installment", "monthly_rent", "annual_rent", "salary", "allowance", "bonus", "deduction",
  "insurance_premium", "deductible", "coverage_limit", "security_deposit", "brokerage_fee",
  "administrative_fee", "annual_fee", "subscription_fee", "down_payment", "final_payment",
  "financing_principal", "asset_value", "total_repayment", "financing_cost", "credit_limit",
  "minimum_payment", "late_fee", "early_termination_fee", "collection_cost", "maintenance_cost",
  "renewal_cost", "refund", "tax", "processing_fee", "transfer_fee", "registration_fee", "service_fee",
  "early_settlement_fee", "cancellation_fee", "returned_payment_fee", "recurring_payment",
  "one_time_payment", "conditional_payment", "interest_rate", "outstanding_balance", "other",
] as const;

/** Forbidden per Milestone 5.8 scope: no risk score, safe/unsafe, or affordability judgment anywhere in the shipped copy. */
const FORBIDDEN_TERMS = [
  "risk",
  "خطر",
  "خطورة",
  "safe",
  "unsafe",
  "آمن",
  "affordable",
  "unaffordable",
  "القدرة على تحمل",
  "recommend",
  "أنصح",
  "توصية",
];

function flattenStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) flattenStrings(nested, out);
  }
}

export function run(): void {
  for (const language of ["ar", "en"] as const) {
    const copy = FINANCIAL_METRICS_COPY[language];

    // Every ObligationType/FeeType/PenaltyType/PaymentFrequency enum value has a translated label —
    // never falls back to displaying the raw internal enum string to the user.
    for (const value of OBLIGATION_TYPE_VALUES) {
      assert.ok(copy.obligationTypeLabels[value], `missing ${language} obligationType label for "${value}"`);
    }
    for (const value of FEE_TYPE_VALUES) {
      assert.ok(copy.feeTypeLabels[value], `missing ${language} feeType label for "${value}"`);
    }
    for (const value of PENALTY_TYPE_VALUES) {
      assert.ok(copy.penaltyTypeLabels[value], `missing ${language} penaltyType label for "${value}"`);
    }
    for (const value of PAYMENT_FREQUENCY_VALUES) {
      assert.ok(copy.frequencyLabels[value], `missing ${language} frequency label for "${value}"`);
    }

    // The exact required conditional-cost notice wording.
    if (language === "ar") {
      assert.equal(
        copy.penalties.conditionalNotice,
        "هذه المبالغ مرتبطة بوقوع أحداث أو شروط محددة، ولا تدخل بالضرورة ضمن التكلفة الأساسية للعقد.",
      );
      assert.equal(copy.calculationFailed, "تعذر حساب المؤشرات المالية لهذا العقد.");
      assert.equal(copy.calculationFailedHint, "يمكنك الاستمرار في مراجعة تحليل العقد أعلاه.");
      assert.equal(copy.fees.empty, "لم يتم تحديد رسوم محددة.");
    } else {
      assert.equal(
        copy.penalties.conditionalNotice,
        "These amounts depend on specific events or conditions and are not necessarily included in the contract’s normal cost.",
      );
      assert.equal(copy.calculationFailed, "Financial metrics could not be calculated for this contract.");
      assert.equal(copy.calculationFailedHint, "You can still review the contract analysis above.");
      assert.equal(copy.fees.empty, "No specific fees were identified.");
    }

    // No Risk Score / safe-unsafe / affordability / recommendation wording anywhere in the copy.
    const allStrings: string[] = [];
    flattenStrings(copy, allStrings);
    const combined = allStrings.join(" \n ").toLowerCase();
    for (const term of FORBIDDEN_TERMS) {
      assert.equal(
        combined.includes(term.toLowerCase()),
        false,
        `forbidden term "${term}" must not appear anywhere in the ${language} financial metrics copy`,
      );
    }
  }

  // Every canonical financial concept id has a real, translated label in both
  // languages — this is the generic fix for "Balloon payment" (and any other
  // engine-hardcoded label) leaking untranslated: the UI never reads the raw
  // engine label for a known concept, only this exhaustive dictionary.
  for (const language of ["ar", "en"] as const) {
    for (const conceptId of ALL_CANONICAL_CONCEPT_IDS) {
      const label = getCanonicalConceptLabel(conceptId, language);
      assert.ok(label && label.length > 0, `missing ${language} label for canonical concept "${conceptId}"`);
    }
  }
  assert.equal(getCanonicalConceptLabel("final_payment", "ar"), "الدفعة الختامية", "the balloon/final-payment concept must be localized, not left as raw 'Balloon payment'");
  assert.equal(getCanonicalConceptLabel("administrative_fee", "ar"), "الرسوم الإدارية");
  assert.equal(getCanonicalConceptLabel("administrative_fee", "en"), "Administrative fee");

  // The Milestone 5.9 rename: the upfront-payment-to-financing ratio label must
  // clearly reference the financed amount, not a generic "base cost".
  assert.equal(FINANCIAL_METRICS_COPY.ar.ratios.upfrontPaymentToBaseCost, "نسبة الدفعة المقدمة إلى مبلغ التمويل");

  console.log("PASS financialMetricsCopy.test.ts");
}

run();
