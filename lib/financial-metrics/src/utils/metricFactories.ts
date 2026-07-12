import type { Confidence } from "../enums";
import type { MoneyMetric } from "../moneyMetric";
import type { PercentageMetric } from "../percentageMetric";
import { round2 } from "./rounding";

export function knownMoney(
  value: number,
  currency: string,
  source: string | null,
  confidence: Confidence = "high",
): MoneyMetric {
  return { value: round2(value), currency, status: "known", source, reason: null, confidence };
}

export function estimatedMoney(
  value: number,
  currency: string,
  source: string | null,
  reason: string | null = null,
  confidence: Confidence = "medium",
): MoneyMetric {
  return { value: round2(value), currency, status: "estimated", source, reason, confidence };
}

export function unavailableMoney(reason: string, source: string | null = null): MoneyMetric {
  return { value: null, currency: null, status: "unavailable", source, reason, confidence: "low" };
}

export function knownPercentage(
  value: number,
  source: string | null,
  confidence: Confidence = "high",
): PercentageMetric {
  return { value: round2(value), status: "known", source, reason: null, confidence };
}

export function unavailablePercentage(reason: string, source: string | null = null): PercentageMetric {
  return { value: null, status: "unavailable", source, reason, confidence: "low" };
}

/** Only "known" entries with both a value and a currency are summable; mixed currencies among them make the sum unavailable rather than merged. */
export function sumKnownMoneyMetrics(
  amounts: readonly MoneyMetric[],
  source: string,
  reasonWhenEmpty: string,
): MoneyMetric {
  const known = amounts.filter(
    (amount): amount is MoneyMetric & { value: number; currency: string } =>
      amount.status === "known" && amount.value !== null && amount.currency !== null,
  );
  if (known.length === 0) {
    return unavailableMoney(reasonWhenEmpty, source);
  }
  const currencies = new Set(known.map((amount) => amount.currency));
  if (currencies.size > 1) {
    return unavailableMoney("known amounts use more than one currency and cannot be summed", source);
  }
  const currency = known[0].currency;
  const total = known.reduce((sum, amount) => sum + amount.value, 0);
  return knownMoney(total, currency, source);
}

export function maxKnownMoneyMetric(
  amounts: readonly MoneyMetric[],
  source: string,
  reasonWhenEmpty: string,
): MoneyMetric {
  const known = amounts.filter(
    (amount): amount is MoneyMetric & { value: number; currency: string } =>
      amount.status === "known" && amount.value !== null && amount.currency !== null,
  );
  if (known.length === 0) {
    return unavailableMoney(reasonWhenEmpty, source);
  }
  const currencies = new Set(known.map((amount) => amount.currency));
  if (currencies.size > 1) {
    return unavailableMoney("known amounts use more than one currency and cannot be compared", source);
  }
  const currency = known[0].currency;
  const max = known.reduce((best, amount) => Math.max(best, amount.value), Number.NEGATIVE_INFINITY);
  return knownMoney(max, currency, source);
}
