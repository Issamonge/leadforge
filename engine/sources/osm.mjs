#!/usr/bin/env node
/**
 * engine/sources/osm.mjs — leads that publish a REAL contact email.
 *
 * Source: OpenStreetMap via the Overpass API (free, no API key, ODbL licensed).
 * These are business contact addresses the businesses themselves publish for
 * the purpose of being contacted — the lawful kind of cold B2B outreach target.
 */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];
const UA = "lead-machine/1.0 (B2B outreach; contact: ihakizimana11@gmail.com)";

// Target markets (south, west, north, east)
export const CITIES = {
  Dubai: [24.9, 55.0, 25.4, 55.5],
  "Abu Dhabi": [24.3, 54.3, 24.62, 54.85],
  London: [51.35, -0.35, 51.65, 0.05],
  "New York": [40.55, -74.15, 40.92, -73.7],
  "Los Angeles": [33.9, -118.55, 34.35, -118.1],
  Chicago: [41.7, -87.9, 42.05, -87.5],
  Toronto: [43.55, -79.65, 43.85, -79.2],
  Sydney: [-34.05, 150.9, -33.65, 151.35],
};

// Category -> the service we pitch them
export const CATEGORY_SERVICE = {
  dentist: ["Lead capture & booking automation", "no-show reduction"],
  clinic: ["Patient booking automation", "follow-up sequences"],
  doctors: ["Appointment automation", "intake processing"],
  veterinary: ["Booking automation", "reminder sequences"],
  car_repair: ["Service booking automation", "estimate follow-up"],
  car: ["Lead follow-up automation", "CRM integration"],
  estate_agent: ["Deal pipeline automation", "lead enrichment"],
  lawyer: ["Client intake automation", "document extraction"],
  accountant: ["Receipt & expense automation", "client reminders"],
  insurance: ["Quote follow-up automation", "document processing"],
  travel_agent: ["Booking automation", "enquiry follow-up"],
  it: ["AI agent & workflow automation", "internal tooling"],
  computer: ["AI workflow automation", "data pipelines"],
  electronics: ["Lead automation", "inventory reporting"],
  furniture: ["Lead follow-up", "quote automation"],
  jewelry: ["Clienteling automation", "order follow-up"],
  beauty: ["Booking automation", "rebooking reminders"],
  childcare: ["Enquiry automation", "parent communication"],
  language_school: ["Enrolment automation", "lead nurturing"],
  driving_school: ["Lesson booking automation", "reminder sequences"],
};

const AMENITIES = Object.keys(CATEGORY_SERVICE).filter((k) =>
  ["dentist","clinic","doctors","veterinary","car_repair","childcare","language_school","driving_school"].includes(k));
const OFFICES = Object.keys(CATEGORY_SERVICE).filter((k) =>
  ["estate_agent","lawyer","accountant","insurance","travel_agent","it"].includes(k));
const SHOPS = Object.keys(CATEGORY_SERVICE).filter((k) =>
  ["car","computer","electronics","furniture","jewelry","beauty"].includes(k));

function buildQuery(bbox) {
  const [s, w, n, e] = bbox;
  const box = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:90];
(
  nwr["amenity"~"^(${AMENITIES.join("|")})$"]["email"]${box};
  nwr["amenity"~"^(${AMENITIES.join("|")})$"]["mobile"]${box};
  nwr["amenity"~"^(${AMENITIES.join("|")})$"]["contact:mobile"]${box};
  nwr["office"~"^(${OFFICES.join("|")})$"]["email"]${box};
  nwr["office"~"^(${OFFICES.join("|")})$"]["mobile"]${box};
  nwr["office"~"^(${OFFICES.join("|")})$"]["contact:mobile"]${box};
  nwr["shop"~"^(${SHOPS.join("|")})$"]["email"]${box};
  nwr["shop"~"^(${SHOPS.join("|")})$"]["mobile"]${box};
  nwr["shop"~"^(${SHOPS.join("|")})$"]["contact:mobile"]${box};
  nwr["amenity"~"^(${AMENITIES.join("|")})$"]["contact:email"]${box};
  nwr["office"~"^(${OFFICES.join("|")})$"]["contact:email"]${box};
  nwr["shop"~"^(${SHOPS.join("|")})$"]["contact:email"]${box};
);
out center 400;`;
}

async function overpass(bbox, timeoutMs = 45000) {
  const body = "data=" + encodeURIComponent(buildQuery(bbox));
  let lastErr;
  for (const endpoint of ENDPOINTS.slice(0, 2)) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json?.elements?.length) return json;
      lastErr = new Error("empty result");
    } catch (e) { lastErr = e; }
    finally { clearTimeout(t); }
  }
  throw lastErr || new Error("all Overpass mirrors failed");
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;
const BAD = /(example\.com|test\.com|noreply|no-reply|sentry|wixpress|@2x|\.png|\.jpg)/i;

export function extractEmails(tags) {
  const raw = [tags.email, tags["contact:email"], tags["contact:email:1"]].filter(Boolean);
  const out = [];
  for (const r of raw) {
    for (const piece of String(r).split(/[;,]/)) {
      const e = piece.trim().toLowerCase();
      if (EMAIL_RE.test(e) && !BAD.test(e)) out.push(e);
    }
  }
  return [...new Set(out)];
}

export async function fromOsmBusinesses({ cities = ["Dubai", "London", "New York"], limitPerCity = 60 } = {}) {
  const out = [];
  for (const city of cities) {
    const bbox = CITIES[city];
    if (!bbox) continue;
    let data;
    try { data = await overpass(bbox); } catch (e) { console.error(`[osm:${city}] ${e.message}`); continue; }
    const els = data?.elements || [];
    for (const el of els) {
      const t = el.tags || {};
      const emails = extractEmails(t);
      const mobile = (t.mobile || t["contact:mobile"] || "").trim();
      const landline = (t.phone || t["contact:phone"] || "").trim();
      if (!emails.length && !mobile && !landline) continue;
      const cat = t.amenity || t.office || t.shop || "business";
      const services = CATEGORY_SERVICE[cat] || ["AI automation"];
      const name = (t.name || t["name:en"] || "Local business").slice(0, 90);
      const addr = [t["addr:street"], t["addr:city"]].filter(Boolean).join(", ");
      out.push({
        id: `osm-${el.type}-${el.id}`,
        source: "OpenStreetMap",
        title: `${name} — ${cat.replace(/_/g, " ")}${addr ? " (" + addr + ")" : ""}`,
        description: `Business in ${city}. Category: ${cat}. Services to pitch: ${services.join(", ")}. Website: ${t.website || t["contact:website"] || "n/a"}. Phone: ${t.phone || t["contact:phone"] || "n/a"}.`,
        email: emails[0] || "",
        phone: mobile || landline || "",
        mobileNumber: mobile || "",
        hasMobile: !!mobile,
        website: t.website || t["contact:website"] || "",
        city,
        category: cat,
        services,
        url: t.website || t["contact:website"] || `https://www.openstreetmap.org/${el.type}/${el.id}`,
        postedAt: new Date().toISOString(),
        raw: `${name} ${cat} ${city}`,
        _emailLead: true,
      });
      if (out.filter((o) => o.city === city).length >= limitPerCity) break;
    }
  }
  return out;
}
