import type { AnalysisLanguage } from "@workspace/contract-types";
import type { DurationUnit, MetricStatus } from "@workspace/financial-metrics";

const LOCALE_BY_LANGUAGE: Record<AnalysisLanguage, string> = {
  ar: "ar-SA",
  en: "en-US",
};

/**
 * `ar-SA` defaults to Eastern Arabic-Indic digits (e.g. "٥") in
 * `Intl.NumberFormat`. The rest of this app's Arabic UI uses Western/ASCII
 * digits (see `ResultsScreen.tsx`'s `formatOverviewValue`) with only the
 * percent *sign* localized — `numberingSystem: "latn"` keeps digits
 * consistent with that existing convention regardless of locale.
 */
const NUMBER_FORMAT_OPTIONS = { maximumFractionDigits: 2, minimumFractionDigits: 0, numberingSystem: "latn" } as const;

/** True for a value that is safe to render as a real number — never `NaN`/`Infinity`/`-Infinity`. */
function isRenderableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatPlainNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, NUMBER_FORMAT_OPTIONS).format(value);
}

/**
 * Formats a known amount in its backend-supplied currency. `Intl.NumberFormat`
 * throws a `RangeError` for a syntactically 3-letter code that is not an
 * actual registered ISO-4217 currency (the schema only checks the letter
 * pattern, not the registry) — handled here by falling back to a plain
 * number with the raw code appended, so an unsupported code can never crash
 * the UI and the backend's currency is never silently dropped.
 */
function formatCurrencyAmount(value: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      ...NUMBER_FORMAT_OPTIONS,
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${formatPlainNumber(value, locale)} ${currency}`;
  }
}

export interface MoneyMetricLike {
  value: number | null;
  currency: string | null;
  reason: string | null;
}

export interface FormattedMoneyDisplay {
  kind: "value" | "unavailable";
  /** The primary text to render — either the formatted amount or the unavailable label. */
  text: string;
  /** A user-safe reason, present only when `kind === "unavailable"` and the backend supplied one. */
  reason: string | null;
  /** True when a numeric value is known but no currency was resolved for it. */
  currencyUnknown: boolean;
}

/**
 * Renders a `MoneyMetric`-shaped value. Never invents a currency, never
 * converts one, and never renders `null`/`NaN`/`Infinity` as a number —
 * those all resolve to the unavailable state. A backend-supplied `0` is
 * rendered as `0`, never conflated with "unavailable".
 */
export function formatMoneyMetric(
  metric: MoneyMetricLike,
  language: AnalysisLanguage,
  unavailableLabel: string,
): FormattedMoneyDisplay {
  if (metric.value === null || !isRenderableNumber(metric.value)) {
    return { kind: "unavailable", text: unavailableLabel, reason: metric.reason, currencyUnknown: false };
  }

  const locale = LOCALE_BY_LANGUAGE[language];

  if (metric.currency === null) {
    return { kind: "value", text: formatPlainNumber(metric.value, locale), reason: null, currencyUnknown: true };
  }

  return {
    kind: "value",
    text: formatCurrencyAmount(metric.value, metric.currency, locale),
    reason: null,
    currencyUnknown: false,
  };
}

export interface PercentageMetricLike {
  value: number | null;
  reason: string | null;
}

export interface FormattedPercentageDisplay {
  kind: "value" | "unavailable";
  text: string;
  reason: string | null;
}

/**
 * Renders a `PercentageMetric`-shaped value. The schema stores percentage
 * *points* (e.g. `12.5` means `12.5%`) — this never multiplies by 100 and
 * never applies `Intl.NumberFormat`'s `style: "percent"` (which expects a
 * 0–1 fraction and would turn `12.5` into `1250%`).
 */
export function formatPercentageMetric(
  metric: PercentageMetricLike,
  language: AnalysisLanguage,
  unavailableLabel: string,
  percentSign: string,
): FormattedPercentageDisplay {
  if (metric.value === null || !isRenderableNumber(metric.value)) {
    return { kind: "unavailable", text: unavailableLabel, reason: metric.reason };
  }

  const locale = LOCALE_BY_LANGUAGE[language];
  const formatted = new Intl.NumberFormat(locale, NUMBER_FORMAT_OPTIONS).format(metric.value);
  return { kind: "value", text: `${formatted}${percentSign}`, reason: null };
}

export interface ContractDurationLike {
  value: number | null;
  unit: DurationUnit | null;
  months: number | null;
  days: number | null;
  status: MetricStatus;
  reason: string | null;
}

export interface DurationUnitCopy {
  days: string;
  weeks: string;
  months: string;
  years: string;
}

export interface FormattedDurationDisplay {
  kind: "value" | "unavailable";
  primaryText: string;
  /** At most one secondary equivalent (e.g. "≈ 1,095 days"), never more. */
  secondaryText: string | null;
  reason: string | null;
}

function formatUnitValue(value: number, unitLabel: string, locale: string): string {
  return `${formatPlainNumber(value, locale)} ${unitLabel}`;
}

/**
 * Picks one clear primary duration (priority: months → years → days → the
 * generic value/unit pair) and, at most, one secondary equivalent — never
 * three repeated cards for the same period. `months`/`days`/`value+unit`
 * are independent fields the engine does not force-derive from one
 * another, so this only ever displays fields the backend actually
 * populated — it never calculates a new equivalent in the frontend.
 */
export function formatContractDuration(
  duration: ContractDurationLike,
  language: AnalysisLanguage,
  unavailableLabel: string,
  unitCopy: DurationUnitCopy,
): FormattedDurationDisplay {
  const locale = LOCALE_BY_LANGUAGE[language];

  if (duration.months !== null && isRenderableNumber(duration.months)) {
    const secondary =
      duration.days !== null && isRenderableNumber(duration.days)
        ? formatUnitValue(duration.days, unitCopy.days, locale)
        : null;
    return {
      kind: "value",
      primaryText: formatUnitValue(duration.months, unitCopy.months, locale),
      secondaryText: secondary,
      reason: null,
    };
  }

  if (duration.unit === "years" && duration.value !== null && isRenderableNumber(duration.value)) {
    return {
      kind: "value",
      primaryText: formatUnitValue(duration.value, unitCopy.years, locale),
      secondaryText: null,
      reason: null,
    };
  }

  if (duration.days !== null && isRenderableNumber(duration.days)) {
    return {
      kind: "value",
      primaryText: formatUnitValue(duration.days, unitCopy.days, locale),
      secondaryText: null,
      reason: null,
    };
  }

  if (duration.unit === "weeks" && duration.value !== null && isRenderableNumber(duration.value)) {
    return {
      kind: "value",
      primaryText: formatUnitValue(duration.value, unitCopy.weeks, locale),
      secondaryText: null,
      reason: null,
    };
  }

  return { kind: "unavailable", primaryText: unavailableLabel, secondaryText: null, reason: duration.reason };
}

/** Formats a plain, already-resolved count (e.g. `numberOfPayments`) — no currency, no percentage. */
export function formatCount(value: number, language: AnalysisLanguage): string {
  return formatPlainNumber(value, LOCALE_BY_LANGUAGE[language]);
}
