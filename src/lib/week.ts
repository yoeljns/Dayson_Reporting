import { startOfWeek, addWeeks, addDays, subDays, format, parseISO, differenceInCalendarDays } from "date-fns";

/**
 * Week helpers for the visit-planning UI. Weeks are Monday-anchored (ISO) and
 * passed around as `YYYY-MM-DD` strings (the Monday). Display strings are
 * formatted in Turkish without pulling a locale package.
 */

const ISO_FMT = "yyyy-MM-dd";

/** The team operates in Turkey; anchor "today"/week to this zone, not the
 *  server's (production runs in UTC, which rolls the date over 3h early). */
const APP_TZ = "Europe/Istanbul";

/** Current calendar date (YYYY-MM-DD) in the app timezone, regardless of where
 *  the server runs. `en-CA` formats as YYYY-MM-DD. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(
    new Date()
  );
}

/** Monday (YYYY-MM-DD) of the current week in the app timezone. */
export function currentWeekStart(): string {
  return weekStartOf(parseISO(todayIso()));
}

/** A calendar date `days` before `fromIso` (default: today in app TZ). */
export function isoDaysAgo(days: number, fromIso: string = todayIso()): string {
  return format(subDays(parseISO(fromIso), days), ISO_FMT);
}

const TR_MONTHS = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];
const TR_DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]; // Mon..Sun

/** Full Turkish weekday names, Monday-first (index 0 = Monday). */
export const WEEKDAY_NAMES_TR = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
];

/** Monday (ISO week start) of the week containing `date`, as YYYY-MM-DD. */
export function weekStartOf(date: Date = new Date()): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), ISO_FMT);
}

/** Shift a YYYY-MM-DD week-start by `n` weeks (negative = past). */
export function shiftWeek(weekStart: string, n: number): string {
  return format(addWeeks(parseISO(weekStart), n), ISO_FMT);
}

/** Sunday (end) of the week for a YYYY-MM-DD Monday. */
export function weekEndOf(weekStart: string): string {
  return format(addDays(parseISO(weekStart), 6), ISO_FMT);
}

/** Short Turkish date, e.g. "30 Haz". */
export function formatTRShort(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}`;
}

/** Full Turkish date, e.g. "30 Haz 2025". */
export function formatTRDate(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Human week range, e.g. "30 Haz – 6 Tem 2025". */
export function weekRangeLabel(weekStart: string): string {
  const end = weekEndOf(weekStart);
  return `${formatTRShort(weekStart)} – ${formatTRDate(end)}`;
}

/** The seven days of a week as { iso, label } (Mon..Sun) for a day picker. */
export function weekDayOptions(weekStart: string): { iso: string; label: string }[] {
  const monday = parseISO(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return {
      iso: format(d, ISO_FMT),
      label: `${TR_DAYS[i]} ${d.getDate()} ${TR_MONTHS[d.getMonth()]}`,
    };
  });
}

/** Whole days from `iso` until today (positive = in the past). null if no date. */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return differenceInCalendarDays(new Date(), parseISO(iso));
}

/**
 * Local Date for a weekly deadline: the `weekday` (0=Mon … 6=Sun) of the week
 * starting at `weekStart` (YYYY-MM-DD Monday), at hour:minute. Built from local
 * date parts so the comparison happens in the device's timezone.
 */
export function deadlineFor(
  weekStart: string,
  weekday: number,
  hour: number,
  minute: number
): Date {
  const day = addDays(parseISO(weekStart), weekday);
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hour,
    minute,
    0,
    0
  );
}
