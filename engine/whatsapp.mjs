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

// Country -> mobile number prefixes (after the country code). Without this we
// wrongly flag landlines as WhatsApp-capable — e.g. Tokyo +81 3 (a landline).
const MOBILE_PREFIX = {
  "971": [/^5\d{8}$/],                       // UAE
  "966": [/^5\d{8}$/],                       // Saudi
  "974": [/^[3567]\d{7}$/],                  // Qatar
  "965": [/^[569]\d{7}$/],                   // Kuwait
  "973": [/^3\d{7}$/],                       // Bahrain
  "968": [/^[79]\d{7}$/],                    // Oman
  "962": [/^7\d{8}$/],                       // Jordan
  "961": [/^[378]\d{6,7}$/],                 // Lebanon
  "20":  [/^1\d{9}$/],                       // Egypt
  "90":  [/^5\d{9}$/],                       // Turkey
  "91":  [/^[6789]\d{9}$/],                  // India
  "92":  [/^3\d{9}$/],                       // Pakistan
  "254": [/^[17]\d{8}$/],                    // Kenya
  "234": [/^[789]\d{9}$/],                   // Nigeria
  "233": [/^[25]\d{8}$/],                    // Ghana
  "27":  [/^[678]\d{8}$/],                   // South Africa
  "212": [/^[67]\d{8}$/],                    // Morocco
  "44":  [/^7\d{9}$/],                       // UK
  "353": [/^8[35679]\d{7}$/],                // Ireland
  "33":  [/^[67]\d{8}$/],                    // France
  "49":  [/^1[567]\d{8,9}$/],                // Germany
  "31":  [/^6\d{8}$/],                       // Netherlands
  "34":  [/^[67]\d{8}$/],                    // Spain
  "39":  [/^3\d{8,9}$/],                     // Italy
  "351": [/^9[1236]\d{7}$/],                 // Portugal
  "43":  [/^6\d{8,9}$/],                     // Austria
  "41":  [/^7[5-9]\d{7}$/],                  // Switzerland
  "46":  [/^7[02369]\d{7}$/],                // Sweden
  "48":  [/^[5-8]\d{8}$/],                   // Poland
  "420": [/^[67]\d{8}$/],                    // Czechia
  "1":   [/^\d{10}$/],                        // US / Canada
  "61":  [/^4\d{8}$/],                       // Australia
  "64":  [/^2\d{7,9}$/],                     // New Zealand
  "65":  [/^[89]\d{7}$/],                    // Singapore
  "60":  [/^1\d{8,9}$/],                     // Malaysia
  "66":  [/^[689]\d{8}$/],                   // Thailand
  "62":  [/^8\d{8,11}$/],                    // Indonesia
  "63":  [/^9\d{9}$/],                       // Philippines
  "852": [/^[569]\d{7}$/],                   // Hong Kong
  "81":  [/^[789]0\d{8}$/],                  // Japan (mobile only)
  "82":  [/^10\d{8}$/],                      // South Korea
};

/** Is this really a MOBILE number (i.e. has WhatsApp)? Country-aware. */
export function isMobile(raw) {
  for (const d of allNumbers(raw)) {
    for (const [cc, patterns] of Object.entries(MOBILE_PREFIX)) {
      if (!d.startsWith(cc)) continue;
      const rest = d.slice(cc.length);
      if (patterns.some((re) => re.test(rest))) return true;
    }
  }
  return false;
}

/** Returns the E.164 mobile if verified, otherwise "". */
export function mobileNumber(raw) {
  for (const d of allNumbers(raw)) {
    for (const [cc, patterns] of Object.entries(MOBILE_PREFIX)) {
      if (!d.startsWith(cc)) continue;
      const rest = d.slice(cc.length);
      if (patterns.some((re) => re.test(rest))) return d;
    }
  }
  return "";
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
