#!/usr/bin/env node
/**
 * engine/sources/webemail.mjs — finds the email a business PUBLISHES ON ITS OWN SITE.
 *
 * This is the piece that unlocks any lead source (Google Maps, OSM, directories):
 * most listings give you a website but no email. This fetches the site and pulls
 * the address the business put there for people to contact them.
 */
const UA = "Mozilla/5.0 (compatible; lead-machine/1.0; +mailto:ihakizimana11@gmail.com)";
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BAD = /(example\.com|example\.org|example\.net|\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg|sentry|wixpress|@2x|no-?reply|godaddy|cloudflare|domain\.com|yourdomain|yoursite|email\.com|info\.com|test\.com|localhost|\.invalid|sentry\.io|w3\.org|schema\.org|johndoe|john\.doe)/i;
const CONTACT_PATHS = ["", "/contact", "/contact-us", "/contactus", "/about", "/about-us", "/en/contact", "/impressum"];

async function fetchText(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: ctrl.signal });
    if (!r.ok) return "";
    const ct = r.headers.get("content-type") || "";
    if (!/text|html/i.test(ct)) return "";
    return (await r.text()).slice(0, 400000);
  } catch { return ""; } finally { clearTimeout(t); }
}

export function pickEmails(html) {
  const found = new Set();
  // mailto: links are the strongest signal
  for (const m of html.matchAll(/mailto:([^"'>\s?]+)/gi)) {
    const e = decodeURIComponent(m[1]).trim().toLowerCase();
    if (!BAD.test(e)) found.add(e);
  }
  for (const m of html.matchAll(EMAIL_RE)) {
    const e = m[0].trim().toLowerCase();
    if (e.length > 40 || BAD.test(e)) continue;
    if (/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/.test(e)) continue;
    found.add(e);
  }
  // prefer role addresses
  const arr = [...found];
  const rank = (e) => (/^(info|hello|contact|office|enquiries|enquiry|sales|admin|reception|bookings|appointments)@/.test(e) ? 0 : 1);
  return arr.sort((a, b) => rank(a) - rank(b));
}

const MOBILE_AE = /^(?:9715\d{8}|009715\d{8}|05\d{8}|\+9715\d{8})$/;

/** Pull phone numbers (especially mobiles) a business publishes on its site. */
export function pickPhones(html) {
  const out = new Set();
  for (const m of html.matchAll(/tel:([+\d\s()\-]{7,20})/gi)) {
    const d = m[1].replace(/[^\d+]/g, "");
    if (d.length >= 9) out.add(d);
  }
  for (const m of html.matchAll(/\+?971\s?5\d(?:[\s\-]?\d){7}/g)) out.add(m[0].replace(/[^\d+]/g, ""));
  const arr = [...out];
  arr.sort((a, b) => (MOBILE_AE.test(b) ? 1 : 0) - (MOBILE_AE.test(a) ? 1 : 0));
  return arr;
}

/** Try to find a published email for a website. Returns "" if none. */
export async function emailFromWebsite(website) {
  if (!website) return "";
  let base;
  try { base = new URL(website.startsWith("http") ? website : "https://" + website); } catch { return ""; }
  for (const p of CONTACT_PATHS) {
    const url = p ? new URL(p, base).href : base.href;
    const html = await fetchText(url);
    if (!html) continue;
    const emails = pickEmails(html);
    if (emails.length) return emails[0];
  }
  return "";
}

/** Enrich any lead list from the lead's website: fill missing email AND mobile. */
export async function enrichEmails(leads, { concurrency = 6, onlyMissing = true } = {}) {
  const targets = leads.filter((l) => l.website && (!onlyMissing || !l.email || !l.hasMobile));
  let filled = 0, mobiles = 0;
  for (let i = 0; i < targets.length; i += concurrency) {
    await Promise.all(targets.slice(i, i + concurrency).map(async (l) => {
      let html = "";
      for (const p of CONTACT_PATHS) {
        try {
          const base = new URL(l.website.startsWith("http") ? l.website : "https://" + l.website);
          html = await fetchText(p ? new URL(p, base).href : base.href);
        } catch { html = ""; }
        if (html) break;
      }
      if (!html) return;
      if (!l.email) {
        const e = pickEmails(html)[0];
        if (e) { l.email = e; l.emailFrom = "website"; filled++; }
      }
      if (!l.hasMobile) {
        const ph = pickPhones(html).filter((x) => MOBILE_AE.test(x) || /^9715\d{8}$/.test(x.replace(/[^\d]/g, "")));
        if (ph.length) { l.phone = ph[0]; l.mobileNumber = ph[0]; l.hasMobile = true; mobiles++; }
      }
    }));
  }
  return { checked: targets.length, filled, mobiles };
}
