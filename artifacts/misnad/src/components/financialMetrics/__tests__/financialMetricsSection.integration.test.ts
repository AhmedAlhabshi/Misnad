import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { calculateFinancialMetrics, financialMetricsSchema } from "@workspace/financial-metrics";
import type { ContractUnderstanding } from "@workspace/contract-schema";
import { formatMoneyMetric, formatPercentageMetric, formatContractDuration } from "../../../lib/financialFormatters";
import { FINANCIAL_METRICS_COPY } from "../../../lib/financialMetricsCopy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPONENT_SOURCE = readFileSync(
  path.join(__dirname, "..", "FinancialMetricsSection.tsx"),
  "utf8",
);

/**
 * A single, intentionally messy auto-finance fixture (mirroring the one
 * used in the financial-metrics package's own integration test) — this
 * exercises the real `@workspace/financial-metrics` engine end-to-end,
 * proving the values the UI components consume are genuine, schema-valid
 * output, not a stub.
 */
function buildMessyContractUnderstanding(): ContractUnderstanding {
  return {
    contractType: "auto_finance",
    parties: [],
    financialObligations: [
      { description: "Monthly installment", amount: 1500, currency: "SAR", frequency: "monthly", dueDate: null },
      { description: "Monthly installment", amount: 1500, currency: "SAR", frequency: "monthly", dueDate: null },
      { description: "Monthly installment", amount: 1750, currency: "SAR", frequency: "monthly", dueDate: null },
    ],
    dates: [],
    penalties: [
      { description: "Late payment penalty", amount: 200, currency: "SAR", condition: "if payment is more than 10 days late" },
    ],
    fees: [
      { description: "Refundable security deposit", amount: 3000, currency: "SAR", isRecurring: false },
      { description: "International wire transfer fee", amount: 25, currency: "USD", isRecurring: false },
    ],
    importantClauses: [],
    extractedNumbers: [],
    missingInformation: [],
    extractionNotes: null,
    typeDetails: {
      contractType: "auto_finance",
      vehicleMake: null,
      vehicleModel: null,
      vehicleYear: null,
      financedAmount: 80000,
      downPayment: null,
      interestRate: null,
      loanTermMonths: null,
      monthlyInstallment: 1500,
      balloonPayment: null,
    },
  };
}

export function run(): void {
  const financialMetrics = calculateFinancialMetrics(buildMessyContractUnderstanding());

  // Test 7 / invariant 5: output is schema-validated by the real engine.
  assert.equal(financialMetricsSchema.safeParse(financialMetrics).success, true);

  // "headline monthly commitment renders" — the formatter produces real, non-empty text from real data.
  const monthly = formatMoneyMetric(financialMetrics.recurringCommitment.monthlyEquivalent, "en", "Unavailable");
  assert.equal(monthly.kind, "value");
  assert.equal(monthly.text.includes("1,500"), true);

  // "contract duration renders" — this fixture has no loan term or dates, so it must show the unavailable state, not a fabricated value.
  const duration = formatContractDuration(financialMetrics.contractDuration, "en", "Unavailable", {
    days: "day(s)",
    weeks: "week(s)",
    months: "month(s)",
    years: "year(s)",
  });
  assert.equal(duration.kind, "unavailable");
  assert.equal(duration.primaryText, "Unavailable");

  // "fees render separately" / "penalties render separately from normal cost" —
  // conditional penalty is fully visible in the penalty collection, but excluded from calculatedKnownCost.
  assert.equal(financialMetrics.penalties.items.length, 1);
  assert.equal(financialMetrics.penalties.items[0].conditional, true);
  assert.equal(financialMetrics.penalties.totalKnownPenalties.value, 200, "the penalty amount remains visible");
  assert.notEqual(
    financialMetrics.totalCost.calculatedKnownCost.value,
    (financialMetrics.totalCost.calculatedCoreObligations.value ?? 0) + 200,
    "calculatedKnownCost must not fold the conditional penalty into normal-path cost",
  );

  // Refundable deposit fee is present but excluded from mandatory-cost accounting; still visible in the fee list.
  const depositFee = financialMetrics.fees.items.find((item) => item.label.toLowerCase().includes("deposit"));
  assert.ok(depositFee, "the deposit fee must remain visible in the fee collection");
  assert.equal(depositFee?.refundable, true);

  // "mixed currencies render as separate totals" — never one merged sum.
  const currencies = financialMetrics.exposure.totalsByCurrency.map((entry) => entry.currency);
  assert.ok(currencies.includes("SAR"));
  assert.ok(currencies.includes("USD"));
  assert.equal(financialMetrics.exposure.totalsByCurrency.length, 2, "each currency must be its own entry, never merged");
  assert.equal(financialMetrics.currency, null, "an ambiguous multi-currency contract must leave the root currency unresolved");

  // "ratios use percentage-point formatting" — a real ratio value is never multiplied by 100 when displayed.
  for (const key of [
    "feesToBaseCost",
    "penaltiesToBaseCost",
    "upfrontPaymentToBaseCost",
    "balloonPaymentToBaseCost",
    "totalCostIncrease",
    "recurringPaymentToIncome",
  ] as const) {
    const metric = financialMetrics.ratios[key];
    const display = formatPercentageMetric(metric, "en", "Unavailable", "%");
    if (metric.value !== null) {
      assert.equal(display.text, `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(metric.value)}%`);
    }
  }

  // "internal source paths or candidate IDs are not rendered" — the component source never
  // interpolates a MoneyMetric's `.source` (an internal field-path string like
  // "typeDetails.monthlyInstallment") or a raw `.id`/`.sourceField(s)` value into visible text.
  assert.equal(/\.source\b/.test(COMPONENT_SOURCE), false, "must never render a metric's internal `.source` field");
  // `.id` is legitimately used as a React reconciliation `key={x.id}` — that is never rendered as
  // visible text, so only flag `.id` interpolations that are NOT a `key=` prop.
  const idInterpolations = COMPONENT_SOURCE.match(/\{[a-zA-Z]+\.id\}/g) ?? [];
  const idInterpolationsOutsideKeyProp = idInterpolations.filter((match) => {
    const index = COMPONENT_SOURCE.indexOf(match);
    const precedingText = COMPONENT_SOURCE.slice(Math.max(0, index - 6), index);
    return !precedingText.includes("key=");
  });
  assert.equal(
    idInterpolationsOutsideKeyProp.length,
    0,
    `must never interpolate a raw internal id into rendered text (found: ${idInterpolationsOutsideKeyProp.join(", ")})`,
  );
  assert.equal(/sourceField/i.test(COMPONENT_SOURCE), false, "must never reference sourceField(s) for display");

  // "no Risk Score text appears" — static scan of the actual shipped component source.
  const lowerSource = COMPONENT_SOURCE.toLowerCase();
  for (const term of ["risk", "safe", "unsafe", "afford", "recommend"]) {
    assert.equal(lowerSource.includes(term), false, `component source must never contain "${term}"`);
  }

  // No financial formula/arithmetic is implemented in the frontend component.
  assert.equal(/\.value\s*[*/+-]\s*\d/.test(COMPONENT_SOURCE), false, "the component must never perform arithmetic on a metric's value");
  assert.equal(/new Date\(/.test(COMPONENT_SOURCE), false, "the component must never read the system clock");

  // Arabic and English labels both render (copy keys resolve to non-empty strings for every language).
  for (const language of ["ar", "en"] as const) {
    const copy = FINANCIAL_METRICS_COPY[language];
    assert.ok(copy.title.length > 0);
    assert.ok(copy.summary.monthlyCommitment.length > 0);
    assert.ok(copy.paymentObligations.title.length > 0);
  }

  console.log("PASS financialMetricsSection.integration.test.ts");
}

run();
