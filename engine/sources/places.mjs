#!/usr/bin/env node
/**
 * engine/sources/places.mjs — Google Maps / Places as a lead source.
 *
 * IMPORTANT TRUTH ABOUT GOOGLE MAPS: the Places API returns business name,
 * website, phone and address — but it NEVER returns an email address.
 * So this source pairs with engine/sources/webemail.mjs, which visits each
 * business's own website and pulls the address they publish there.
 *
 * Needs GOOGLE_MAPS_API_KEY (Places API enabled + billing on the project).
 */
import { emailFromWebsite } from "./webemail.mjs";

const FIELD_MASK = [
  "places.displayName",
  "places.websiteUri",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.primaryTypeDisplayName",
  "places.rating",
].join(",");

export const PLACES_QUERIES = [
  "dental clinic in Dubai",
  "medical clinic in Dubai",
  "real estate agency in Dubai",
  "law firm in Dubai",
  "accounting firm in Dubai",
  "veterinary clinic in Dubai",
  "beauty salon in Dubai",
  "car repair garage in Dubai",
];

export async function searchPlaces(query, key) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 20 }),
  });
  if (!r.ok) throw new Error(`Places HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return (await r.json()).places || [];
}

export async function fromGooglePlaces({ queries = PLACES_QUERIES, withEmails = true, concurrency = 6 } = {}) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];
  const out = [];
  for (const q of queries) {
    let places = [];
    try { places = await searchPlaces(q, key); } catch (e) { console.error(`[places] ${e.message}`); continue; }
    const city = (q.match(/in ([A-Za-z ]+)$/) || [])[1] || "";
    for (const p of places) {
      const name = p.displayName?.text || "Business";
      const website = p.websiteUri || "";
      out.push({
        id: `gplaces-${Buffer.from(name + website).toString("base64").slice(0, 24)}`,
        source: "Google Maps",
        title: `${name}${p.primaryTypeDisplayName?.text ? " — " + p.primaryTypeDisplayName.text : ""}`,
        description: `Google Maps listing in ${city}. Address: ${p.formattedAddress || "n/a"}. Phone: ${p.nationalPhoneNumber || "n/a"}. Website: ${website || "n/a"}. Rating: ${p.rating || "n/a"}.`,
        website,
        phone: p.nationalPhoneNumber || "",
        city,
        category: (p.primaryTypeDisplayName?.text || "business").toLowerCase(),
        services: ["AI automation", "lead follow-up automation"],
        url: website || "https://maps.google.com",
        postedAt: new Date().toISOString(),
        raw: `${name} ${city}`,
        _emailLead: true,
      });
    }
  }
  if (withEmails) {
    for (let i = 0; i < out.length; i += concurrency) {
      await Promise.all(out.slice(i, i + concurrency).map(async (l) => {
        const e = await emailFromWebsite(l.website);
        if (e) { l.email = e; l.emailFrom = "website"; }
      }));
    }
  }
  return out;
}
