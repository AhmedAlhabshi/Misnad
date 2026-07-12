const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
// Assumed day-first (DD/MM/YYYY or DD-MM-YYYY) — the region this application
// targets conventionally writes dates day-first. Ambiguous 2-digit-year or
// MM/DD/YYYY input is deliberately not guessed.
const DAY_FIRST_DATE_PATTERN = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Calendar-safe validity check (rejects e.g. 2026-02-30) without relying on the system clock or timezone. */
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Normalizes a complete calendar date to ISO `YYYY-MM-DD`. Returns `null`
 * for partial dates (year-only, year-month) rather than inventing a missing
 * day/month, and for anything that is not a valid calendar date.
 */
export function normalizeToIsoDate(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const isoMatch = ISO_DATE_PATTERN.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return isValidCalendarDate(year, month, day) ? trimmed : null;
  }

  const dayFirstMatch = DAY_FIRST_DATE_PATTERN.exec(trimmed);
  if (dayFirstMatch) {
    const day = Number(dayFirstMatch[1]);
    const month = Number(dayFirstMatch[2]);
    const year = Number(dayFirstMatch[3]);
    if (!isValidCalendarDate(year, month, day)) {
      return null;
    }
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  return null;
}

/** Whole-day difference between two ISO dates (`end` minus `start`), calendar-safe and timezone-independent (UTC midnight for both). Negative if `end` precedes `start`. */
export function daysBetweenIsoDates(startIso: string, endIso: string): number | null {
  const start = ISO_DATE_PATTERN.exec(startIso);
  const end = ISO_DATE_PATTERN.exec(endIso);
  if (!start || !end) {
    return null;
  }
  const startMs = Date.UTC(Number(start[1]), Number(start[2]) - 1, Number(start[3]));
  const endMs = Date.UTC(Number(end[1]), Number(end[2]) - 1, Number(end[3]));
  return Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
}
