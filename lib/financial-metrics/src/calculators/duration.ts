import type { ContractUnderstanding } from "@workspace/contract-schema";
import type { ContractDuration } from "../contractDuration";
import { daysBetweenIsoDates, normalizeToIsoDate } from "../normalize/dates";
import { containsAnyKeyword } from "../normalize/text";
import type { Candidate } from "../pipeline/candidates";

const START_DATE_KEYWORDS = ["start", "effective", "commence", "begin", "بداية", "تاريخ البداية", "سريان"];
const END_DATE_KEYWORDS = ["end", "expiry", "expiration", "maturity", "termination", "نهاية", "تاريخ الانتهاء", "انتهاء"];

function findStartEndDates(dates: ContractUnderstanding["dates"]): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const entry of dates) {
    const iso = normalizeToIsoDate(entry.date);
    if (iso === null) {
      continue;
    }
    if (start === null && containsAnyKeyword(entry.label, START_DATE_KEYWORDS)) {
      start = iso;
    } else if (end === null && containsAnyKeyword(entry.label, END_DATE_KEYWORDS)) {
      end = iso;
    }
  }
  return start !== null && end !== null ? { start, end } : null;
}

interface ExplicitDuration {
  months: number | null;
  years: number | null;
  source: string;
}

/**
 * Only contract types whose `typeDetails` states an explicit contract-term
 * field are covered here (auto/personal finance, mortgage, lease,
 * insurance) — other types have no such field in Milestone 4's schema.
 */
function explicitDurationFromTypeDetails(input: ContractUnderstanding): ExplicitDuration | null {
  const details = input.typeDetails;
  switch (details.contractType) {
    case "auto_finance":
    case "personal_finance":
      return details.loanTermMonths !== null
        ? { months: details.loanTermMonths, years: null, source: "typeDetails.loanTermMonths" }
        : null;
    case "mortgage":
      return details.loanTermYears !== null
        ? { months: null, years: details.loanTermYears, source: "typeDetails.loanTermYears" }
        : null;
    case "lease":
      return details.leaseTermMonths !== null
        ? { months: details.leaseTermMonths, years: null, source: "typeDetails.leaseTermMonths" }
        : null;
    case "insurance":
      return details.policyTermMonths !== null
        ? { months: details.policyTermMonths, years: null, source: "typeDetails.policyTermMonths" }
        : null;
    default:
      return null;
  }
}

/**
 * Only a monthly-frequency installment count converts to a duration exactly
 * (`numberOfPayments` months, no approximation). Other frequencies are
 * deliberately not converted here to avoid an approximate day/month
 * conversion the spec asks us to avoid.
 */
function findInstallmentCountDuration(resolvedObligations: readonly Candidate[]): { months: number; source: string } | null {
  const monthlyWithCount = resolvedObligations.find(
    (candidate) =>
      candidate.obligationType === "recurring_payment" &&
      candidate.frequency === "monthly" &&
      candidate.numberOfPayments !== null &&
      candidate.numberOfPayments > 0,
  );
  if (!monthlyWithCount || monthlyWithCount.numberOfPayments === null) {
    return null;
  }
  return { months: monthlyWithCount.numberOfPayments, source: monthlyWithCount.sourceField };
}

/**
 * Priority: explicit typeDetails term → start/end dates → installment count
 * (monthly only) and frequency → unavailable. Never derives a duration from
 * vague natural-language text, and never forces an approximate
 * days-to-months conversion.
 */
export function calculateContractDuration(
  input: ContractUnderstanding,
  resolvedObligations: readonly Candidate[],
): ContractDuration {
  const explicit = explicitDurationFromTypeDetails(input);
  if (explicit?.months !== null && explicit?.months !== undefined) {
    return {
      value: explicit.months,
      unit: "months",
      months: explicit.months,
      days: null,
      startDate: null,
      endDate: null,
      status: "known",
      source: explicit.source,
      reason: null,
      confidence: "high",
    };
  }
  if (explicit?.years !== null && explicit?.years !== undefined) {
    return {
      value: explicit.years,
      unit: "years",
      months: null,
      days: null,
      startDate: null,
      endDate: null,
      status: "known",
      source: explicit.source,
      reason: null,
      confidence: "high",
    };
  }

  const dateRange = findStartEndDates(input.dates);
  if (dateRange) {
    const days = daysBetweenIsoDates(dateRange.start, dateRange.end);
    if (days !== null && days >= 0) {
      return {
        value: days,
        unit: "days",
        months: null,
        days,
        startDate: dateRange.start,
        endDate: dateRange.end,
        status: "known",
        source: "dates[] (matched start/end labels)",
        reason: null,
        confidence: "medium",
      };
    }
  }

  const installmentDuration = findInstallmentCountDuration(resolvedObligations);
  if (installmentDuration) {
    return {
      value: installmentDuration.months,
      unit: "months",
      months: installmentDuration.months,
      days: null,
      startDate: null,
      endDate: null,
      status: "estimated",
      source: installmentDuration.source,
      reason: null,
      confidence: "medium",
    };
  }

  return {
    value: null,
    unit: null,
    months: null,
    days: null,
    startDate: null,
    endDate: null,
    status: "unavailable",
    source: null,
    reason: "no explicit duration, matching start/end dates, or installment count and frequency were found",
    confidence: "low",
  };
}
