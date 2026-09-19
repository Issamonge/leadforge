#!/usr/bin/env node
/**
 * engine/clock.mjs — never pitch a business in the middle of its night.
 * Your 23:00 Dubai run was landing in India at 03:00. That reads as spam
 * to the recipient AND wastes the send.
 */
const HOUR_OFFSET = 5;                       // businesses are 5h behind Dubai
export function localHour(tz) {
  if (!tz) return null;
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date()));
  } catch { return null; }
}
/** True if it is currently a sensible hour to email this timezone. */
export function isBusinessHours(tz, start = 8, end = 19) {
  const h = localHour(tz);
  if (h === null) return true;               // unknown tz -> don't block
  return h >= start && h < end;
}
/** Human-readable local time for a lead, for the dashboard. */
export function localTimeString(tz) {
  if (!tz) return "—";
  try { return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); }
  catch { return "—"; }
}
export { HOUR_OFFSET };
