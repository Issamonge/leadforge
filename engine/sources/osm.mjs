#!/usr/bin/env node
/**
 * engine/sources/osm.mjs — leads that publish a REAL contact email.
 *
 * Source: OpenStreetMap via the Overpass API (free, no API key, ODbL licensed).
 * These are business contact addresses the businesses themselves publish for
 * the purpose of being contacted — the lawful kind of cold B2B outreach target.
 */
import { readFile as readFile2, writeFile as writeFile2, mkdir as mkdir2 } from "node:fs/promises";
import { resolve as resolve2, dirname as dirname2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
const ROOT2 = resolve2(dirname2(fileURLToPath2(import.meta.url)), "../..");

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];
const UA = "lead-machine/1.0 (B2B outreach; contact: ihakizimana11@gmail.com)";

// Target markets (south, west, north, east)
/** Rotate through the full city list across runs, so 62 cities stay affordable.
 *  Each run scans a batch of `batchSize`, then advances the pointer. */
export async function nextCityBatch(batchSize = 4) {
  const file = resolve2(ROOT2, "data/rotation.json");
  let state = { offset: 0 };
  try { state = JSON.parse(await readFile2(file, "utf8")); } catch {}
  const names = Object.keys(CITIES);
  const batch = [];
  for (let i = 0; i < Math.min(batchSize, names.length); i++) {
    batch.push(names[(state.offset + i) % names.length]);
  }
  state.offset = (state.offset + batchSize) % names.length;
  state.lastRun = new Date().toISOString();
  state.lastBatch = batch;
  try {
    await mkdir2(dirname2(file), { recursive: true });
    await writeFile2(file, JSON.stringify(state, null, 2), "utf8");
  } catch {}
  return batch;
}

/** IANA timezone per city — used so we never pitch a business at 3am. */
export const TZ_OF = {
  Dubai:"Asia/Dubai", Sharjah:"Asia/Dubai", "Abu Dhabi":"Asia/Dubai",
  Riyadh:"Asia/Riyadh", Jeddah:"Asia/Riyadh", Doha:"Asia/Qatar",
  "Kuwait City":"Asia/Kuwait", Muscat:"Asia/Muscat", Manama:"Asia/Bahrain",
  Amman:"Asia/Amman", Beirut:"Asia/Beirut", Cairo:"Africa/Cairo", Istanbul:"Europe/Istanbul",
  Nairobi:"Africa/Nairobi", Lagos:"Africa/Lagos", Accra:"Africa/Accra",
  Johannesburg:"Africa/Johannesburg", "Cape Town":"Africa/Johannesburg", Casablanca:"Africa/Casablanca",
  Mumbai:"Asia/Kolkata", Delhi:"Asia/Kolkata", Bangalore:"Asia/Kolkata", Karachi:"Asia/Karachi",
  Singapore:"Asia/Singapore", "Kuala Lumpur":"Asia/Kuala_Lumpur", Bangkok:"Asia/Bangkok",
  Jakarta:"Asia/Jakarta", Manila:"Asia/Manila", "Hong Kong":"Asia/Hong_Kong",
  Tokyo:"Asia/Tokyo", Seoul:"Asia/Seoul",
  London:"Europe/London", Manchester:"Europe/London", Birmingham:"Europe/London", Dublin:"Europe/Dublin",
  Paris:"Europe/Paris", Berlin:"Europe/Berlin", Amsterdam:"Europe/Amsterdam", Madrid:"Europe/Madrid",
  Barcelona:"Europe/Madrid", Rome:"Europe/Rome", Milan:"Europe/Rome", Lisbon:"Europe/Lisbon",
  Vienna:"Europe/Vienna", Zurich:"Europe/Zurich", Stockholm:"Europe/Stockholm",
  Warsaw:"Europe/Warsaw", Prague:"Europe/Prague",
  Toronto:"America/Toronto", Vancouver:"America/Vancouver", Montreal:"America/Toronto",
  "New York":"America/New_York", Chicago:"America/Chicago", "Los Angeles":"America/Los_Angeles",
  "San Francisco":"America/Los_Angeles", Seattle:"America/Los_Angeles", Miami:"America/New_York",
  Houston:"America/Chicago", Austin:"America/Chicago",
  Sydney:"Australia/Sydney", Melbourne:"Australia/Melbourne", Auckland:"Pacific/Auckland",
};

export const CITIES = {
  // Gulf / Middle East
  Dubai: [24.90, 55.00, 25.40, 55.50],
  Sharjah: [25.20, 55.30, 25.50, 55.60],
  "Abu Dhabi": [24.30, 54.30, 24.62, 54.85],
  Riyadh: [24.50, 46.50, 24.90, 46.90],
  Jeddah: [21.40, 39.10, 21.65, 39.35],
  Doha: [25.20, 51.40, 25.40, 51.60],
  "Kuwait City": [29.20, 47.80, 29.50, 48.20],
  Muscat: [23.50, 58.30, 23.70, 58.70],
  Manama: [26.10, 50.40, 26.30, 50.70],
  Amman: [31.90, 35.80, 32.05, 36.00],
  Beirut: [33.85, 35.45, 33.95, 35.60],
  Cairo: [30.00, 31.10, 30.20, 31.40],
  Istanbul: [40.95, 28.90, 41.10, 29.10],
  // Africa
  Nairobi: [-1.40, 36.70, -1.20, 36.90],
  Lagos: [6.40, 3.20, 6.70, 3.60],
  Accra: [5.50, -0.30, 5.70, -0.10],
  Johannesburg: [-26.30, 27.90, -26.00, 28.20],
  "Cape Town": [-34.00, 18.30, -33.80, 18.60],
  Casablanca: [33.50, -7.70, 33.65, -7.50],
  // Asia
  Mumbai: [18.90, 72.80, 19.30, 73.00],
  Delhi: [28.50, 77.00, 28.80, 77.40],
  Bangalore: [12.80, 77.40, 13.10, 77.80],
  Karachi: [24.80, 67.00, 25.00, 67.20],
  Singapore: [1.24, 103.60, 1.47, 103.90],
  "Kuala Lumpur": [3.00, 101.60, 3.30, 101.80],
  Bangkok: [13.60, 100.40, 13.90, 100.70],
  Jakarta: [-6.30, 106.70, -6.10, 107.00],
  Manila: [14.50, 120.90, 14.70, 121.10],
  "Hong Kong": [22.20, 114.10, 22.40, 114.30],
  Tokyo: [35.60, 139.60, 35.80, 139.90],
  Seoul: [37.40, 126.90, 37.70, 127.20],
  // Europe
  London: [51.35, -0.35, 51.65, 0.05],
  Manchester: [53.40, -2.35, 53.55, -2.15],
  Birmingham: [52.40, -1.98, 52.55, -1.80],
  Dublin: [53.30, -6.35, 53.40, -6.15],
  Paris: [48.80, 2.25, 48.92, 2.45],
  Berlin: [52.45, 13.30, 52.60, 13.55],
  Amsterdam: [52.32, 4.80, 52.42, 5.00],
  Madrid: [40.38, -3.78, 40.48, -3.62],
  Barcelona: [41.35, 2.10, 41.45, 2.22],
  Rome: [41.85, 12.42, 41.95, 12.58],
  Milan: [45.42, 9.12, 45.52, 9.25],
  Lisbon: [38.68, -9.20, 38.78, -9.08],
  Vienna: [48.18, 16.32, 48.25, 16.42],
  Zurich: [47.35, 8.50, 47.42, 8.60],
  Stockholm: [59.28, 18.00, 59.37, 18.15],
  Warsaw: [52.18, 20.94, 52.28, 21.10],
  Prague: [50.04, 14.36, 50.12, 14.50],
  // Americas / Oceania
  Toronto: [43.60, -79.45, 43.72, -79.28],
  Vancouver: [49.23, -123.20, 49.32, -123.00],
  Montreal: [45.46, -73.65, 45.56, -73.50],
  "New York": [40.55, -74.15, 40.92, -73.70],
  Chicago: [41.83, -87.75, 41.95, -87.60],
  "Los Angeles": [33.90, -118.55, 34.35, -118.10],
  "San Francisco": [37.73, -122.50, 37.81, -122.38],
  Seattle: [47.55, -122.40, 47.68, -122.26],
  Miami: [25.72, -80.32, 25.88, -80.13],
  Houston: [29.68, -95.50, 29.83, -95.28],
  Austin: [30.20, -97.85, 30.35, -97.68],
  Sydney: [-34.05, 150.90, -33.65, 151.35],
  Melbourne: [-37.90, 144.80, -37.70, 145.10],
  Auckland: [-36.95, 174.70, -36.75, 174.90],
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
  hairdresser: ["Appointment automation", "no-show reduction"],
  gym: ["Membership follow-up", "lead capture automation"],
  restaurant: ["Reservation automation", "review requests"],
  cafe: ["Loyalty automation", "review requests"],
  hotel: ["Booking automation", "guest messaging"],
  school: ["Enquiry automation", "parent communication"],
  college: ["Enrolment automation", "lead nurturing"],
  pharmacy: ["Refill reminders", "order follow-up"],
  bank: ["Appointment automation", "document intake"],
  financial: ["Client onboarding automation", "reporting"],
  employment_agency: ["Candidate pipeline automation", "screening"],
  consulting: ["Lead qualification", "proposal automation"],
  advertising_agency: ["Client reporting automation", "lead gen"],
  company: ["Workflow automation", "internal tooling"],
  optician: ["Recall automation", "appointment booking"],
  bakery: ["Order automation", "loyalty follow-up"],
  clothes: ["Order follow-up", "inventory reporting"],
  mobile_phone: ["Lead follow-up", "repair booking"],
  photographer: ["Booking automation", "client galleries"],
  car_rental: ["Booking automation", "fleet reporting"],
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
        tz: TZ_OF[city] || "",
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
