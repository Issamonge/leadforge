#!/usr/bin/env node
/**
 * engine/whatsapp.mjs — turn a lead's phone number into a WhatsApp message.
 *
 * WHAT IT DOES: builds a wa.me "click to chat" link with a personalised message.
 * You tap it, WhatsApp opens with the text ready, you hit send.
 *
 * WHY NOT FULL AUTOMATION: unsolicited automated messaging violates WhatsApp's
 * Business Messaging Policy and gets the sending number banned. A click-to-chat
 * link is a normal share link — it is allowed, and it sends from YOUR account,
 * so your number stays safe. For true automation you need the WhatsApp Business
 * API (Meta business verification + pre-approved templates + per-message cost).
 */
/**
 * Phone parsing that actually understands UAE numbers.
 * UAE: mobile = 971 5X XXX XXXX (5x prefix) | landline = 971 4/2/3/6/7/9 ...
 */
function toE164(raw) {
  let d = String(raw).replace(/[^\d]/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);          // 00971... -> 971...
  if (d.startsWith("0") && !d.startsWith("00")) d = "971" + d.slice(1); // 050... -> 97150...
  if (d.length === 9 && d.startsWith("5")) d = "971" + d;               // 501234567
  return d;
}

/** Every distinct number in a possibly multi-number string. */
export function allNumbers(raw) {
  if (!raw) return [];
  return [...new Set(String(raw).split(/[;,]/).map((x) => toE164(x)).filter(Boolean))];
}

const isUaeMobile = (d) => /^9715\d{8}$/.test(d);          // 971 + 5X + 7 digits
const isIntlMobile = (d) => /^\d{11,15}$/.test(d) && !/^971[^5]/.test(d);

/** Returns the first mobile number found, or "" if there is none. */
export function mobileNumber(raw) {
  for (const d of allNumbers(raw)) {
    if (isUaeMobile(d)) return d;
  }
  for (const d of allNumbers(raw)) {
    if (!d.startsWith("971") && isIntlMobile(d)) return d;
  }
  return "";
}

/** True only if a real MOBILE exists (landlines are correctly excluded). */
export function isMobile(raw) {
  return mobileNumber(raw) !== "";
}

export function normalizePhone(raw) {
  const m = mobileNumber(raw);
  if (m) return m;
  return allNumbers(raw)[0] || "";
}

/** Build the outreach message for one lead. */
export function waMessage(lead) {
  const biz = lead.title.split(" — ")[0].trim().slice(0, 50);
  const svc = (lead.services || ["AI automation"])[0];
  const pain = /dentist|clinic|doctor|medical/i.test(lead.category || "")
    ? "missed calls and no-shows"
    : /real estate|lawyer|accountant|insurance/i.test(lead.category || "")
      ? "manual follow-up"
      : "repetitive manual work";
  return [
    `Hello ${biz},`,
    ``,
    `I help businesses in ${lead.city || "the UAE"} cut ${pain} using AI automation — booking, follow-ups and reminders running on their own.`,
    ``,
    `I offer a fixed-price $350 pilot, delivered in 48–72 hours. If it does not save you time, you walk away.`,
    ``,
    `Would a 15-minute call this week be useful?`,
    ``,
    `— Issa Hakizimana, AI Automation Studio`,
  ].join("\n");
}

/** WhatsApp click-to-chat link with the message pre-filled. */
export function waLink(lead) {
  const d = normalizePhone(lead.phone);
  if (!d) return "";
  return `https://wa.me/${d}?text=${encodeURIComponent(waMessage(lead))}`;
}

/** Annotate every lead with WhatsApp readiness. */
export function annotateWhatsApp(leads) {
  let capable = 0;
  for (const l of leads) {
    l.waCapable = isMobile(l.phone);
    l.waLink = l.waCapable ? waLink(l) : "";
    if (l.waCapable) capable++;
  }
  return { total: leads.length, waCapable: capable };
}
