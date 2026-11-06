export const ADMIN_TIMEZONE = "Africa/Johannesburg";

const DAY = 86_400_000;
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ADMIN_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
});

export class InvalidDateRangeError extends Error {
  constructor() {
    super("请选择有效的开始和结束日期，结束日期不能早于开始日期。");
    this.name = "InvalidDateRangeError";
  }
}

function calendarDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const day = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value ? day : null;
}

function southAfricanStart(day) {
  return Date.parse(`${day.toISOString().slice(0, 10)}T00:00:00.000+02:00`);
}

export function reportDateBounds(range, from, to, now = new Date()) {
  if (range === "all") return null;
  if (range === "custom") {
    const startDay = calendarDay(from);
    const lastDay = calendarDay(to);
    if (!startDay || !lastDay || lastDay < startDay) throw new InvalidDateRangeError();
    return { from: southAfricanStart(startDay), before: southAfricanStart(lastDay) + DAY };
  }

  const parts = Object.fromEntries(dayFormatter.formatToParts(now).map(({ type, value }) => [type, value]));
  const today = calendarDay(`${parts.year}-${parts.month}-${parts.day}`);
  if (range === "7d") today.setUTCDate(today.getUTCDate() - 6);
  if (range === "15d") today.setUTCDate(today.getUTCDate() - 14);
  if (range === "week") today.setUTCDate(today.getUTCDate() - (today.getUTCDay() + 6) % 7);
  if (range === "month") today.setUTCDate(1);
  return { from: southAfricanStart(today), before: now.getTime() + 1 };
}

export function reportBucket(range, bounds) {
  if (!bounds) return "month";
  const days = (bounds.before - bounds.from) / DAY;
  if (range === "today" || (range === "custom" && days <= 2)) return "hour";
  if (days <= 93) return "day";
  if (days <= 730) return "week";
  return "month";
}
