import type { PaymentFrequency } from "../enums";
import type { PaymentObligation } from "../paymentObligation";
import type { RecurringCommitment } from "../recurringCommitment";
import { round2 } from "../utils/rounding";
import { knownMoney, unavailableMoney } from "../utils/metricFactories";
import { emptyMetadata, mergeMetadata, type CalculatorMetadata } from "./metadata";

/** Only these frequencies convert to a monthly equivalent; the conversion is only applied when the frequency is explicit and valid, per the spec's formulas. */
export function monthlyEquivalentFactor(frequency: PaymentFrequency): number | null {
  switch (frequency) {
    case "daily":
      return 365 / 12;
    case "weekly":
      return 52 / 12;
    case "monthly":
      return 1;
    case "quarterly":
      return 1 / 3;
    case "semi_annual":
      return 1 / 6;
    case "annual":
      return 1 / 12;
    default:
      return null;
  }
}

interface QualifyingObligation {
  obligation: PaymentObligation;
  monthlyEquivalentValue: number;
}

/** Mandatory obligations with an explicit, convertible recurring cadence and a fully-known (value + currency) amount. */
function findQualifyingObligations(obligations: readonly PaymentObligation[]): QualifyingObligation[] {
  const qualifying: QualifyingObligation[] = [];
  for (const obligation of obligations) {
    if (obligation.mandatory !== true) {
      continue;
    }
    const factor = monthlyEquivalentFactor(obligation.frequency);
    if (factor === null) {
      continue;
    }
    if (obligation.amount.value === null || obligation.amount.currency === null) {
      continue;
    }
    qualifying.push({ obligation, monthlyEquivalentValue: obligation.amount.value * factor });
  }
  return qualifying;
}

export function calculateRecurringCommitment(
  obligations: readonly PaymentObligation[],
): { result: RecurringCommitment; metadata: CalculatorMetadata } {
  const qualifying = findQualifyingObligations(obligations);

  if (qualifying.length === 0) {
    const reason = "no mandatory obligation with a known amount, currency, and a convertible recurring frequency was found";
    const unavailable = unavailableMoney(reason);
    return {
      result: {
        actualMonthlyAmount: unavailable,
        monthlyEquivalent: unavailable,
        annualEquivalent: unavailable,
        minimumMonthlyAmount: unavailable,
        maximumMonthlyAmount: unavailable,
        isVariable: null,
        includedObligationIds: [],
      },
      metadata: {
        ...emptyMetadata(),
        unavailable: ["recurringCommitment.monthlyEquivalent", "recurringCommitment.annualEquivalent"],
      },
    };
  }

  const currencies = new Set(qualifying.map((entry) => entry.obligation.amount.currency));
  if (currencies.size > 1) {
    const reason = "qualifying recurring obligations use more than one currency, which cannot be combined into a single total";
    const unavailable = unavailableMoney(reason);
    return {
      result: {
        actualMonthlyAmount: unavailable,
        monthlyEquivalent: unavailable,
        annualEquivalent: unavailable,
        minimumMonthlyAmount: unavailable,
        maximumMonthlyAmount: unavailable,
        isVariable: null,
        includedObligationIds: qualifying.map((entry) => entry.obligation.id),
      },
      metadata: {
        ...emptyMetadata(),
        unavailable: ["recurringCommitment.monthlyEquivalent", "recurringCommitment.annualEquivalent"],
        warnings: [
          {
            code: "MIXED_CURRENCY",
            severity: "medium",
            messageKey: "recurring_commitment_mixed_currency",
            sourceFields: qualifying.map((entry) => entry.obligation.id),
            details: `currencies found: ${[...currencies].join(", ")}`,
          },
        ],
      },
    };
  }

  const currency = [...currencies][0] as string;
  const monthlyEquivalentValue = qualifying.reduce((sum, entry) => sum + entry.monthlyEquivalentValue, 0);
  const actualMonthlyValue = qualifying
    .filter((entry) => entry.obligation.frequency === "monthly")
    .reduce((sum, entry) => sum + (entry.obligation.amount.value ?? 0), 0);

  const monthlyEquivalent = knownMoney(monthlyEquivalentValue, currency, "calculated from recurring payment obligations");
  const annualEquivalent = knownMoney(monthlyEquivalentValue * 12, currency, "monthlyEquivalent × 12");
  const actualMonthlyAmount =
    actualMonthlyValue > 0
      ? knownMoney(actualMonthlyValue, currency, "sum of monthly-frequency obligations")
      : unavailableMoney("no obligation is billed on an exact monthly cadence", "calculated");

  const metadata: CalculatorMetadata = {
    ...emptyMetadata(),
    formulas: [
      {
        metric: "recurringCommitment.monthlyEquivalent",
        formula: "sum(amount × monthlyEquivalentFactor(frequency)) for each mandatory recurring obligation",
        inputs: Object.fromEntries(qualifying.map((entry) => [entry.obligation.id, entry.obligation.amount.value])),
        result: round2(monthlyEquivalentValue),
        status: "known",
      },
      {
        metric: "recurringCommitment.annualEquivalent",
        formula: "monthlyEquivalent × 12",
        inputs: { monthlyEquivalent: round2(monthlyEquivalentValue) },
        result: round2(monthlyEquivalentValue * 12),
        status: "known",
      },
    ],
  };

  return {
    result: {
      actualMonthlyAmount,
      monthlyEquivalent,
      annualEquivalent,
      // No explicit variable-amount range exists in Milestone 4's schema
      // today, so the min/max bounds mirror the resolved monthly equivalent
      // rather than fabricating a spread; `isVariable` stays unknown (null).
      minimumMonthlyAmount: monthlyEquivalent,
      maximumMonthlyAmount: monthlyEquivalent,
      isVariable: null,
      includedObligationIds: qualifying.map((entry) => entry.obligation.id),
    },
    metadata,
  };
}
