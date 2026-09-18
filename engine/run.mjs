#!/usr/bin/env node
/**
 * Lead Engine — autonomous daily lead discovery + scoring + outreach drafting.
 * Runs on Node 18+ (uses global fetch). No paid dependencies.
 *
 * Free sources only (no API keys required):
 *   - n8n community jobs (Discourse JSON)
 *   - Make.com community (Discourse JSON)
 *   - Hacker News "Who is hiring" (Algolia API)
 *   - RemoteOK public API
 *   - Remotive public API
 *
 * Output: data/leads.json  (consumed by index.html dashboard)
 * Optional: sends a digest email via Resend if RESEND_API_KEY is set.
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { alertNewLeads, alertPhoneCall } from "./notify.mjs";
import { fromOsmBusinesses } from "./sources/osm.mjs";
import { fromGooglePlaces } from "./sources/places.mjs";
import { enrichEmails } from "./sources/webemail.mjs";
import { annotateWhatsApp } from "./whatsapp.mjs";
import { sendOutreach, buildEmail } from "./send.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data");
const OUT_FILE = resolve(DATA_DIR, "leads.json");

// ---------------------------------------------------------------- config
const CONFIG = {
  dailyTarget: Number(process.env.DAILY_TARGET || 30),
  minBudget: Number(process.env.MIN_BUDGET || 0),
  digestEmail: process.env.DIGEST_EMAIL || "",
  paypalEmail: process.env.PAYPAL_EMAIL || "",
  payoutGoal: Number(process.env.PAYOUT_GOAL || 500),
  paymentLink: process.env.PAYMENT_LINK || "https://paypal.me/7900861",
  pilotPrice: Number(process.env.PILOT_PRICE || 350),
  whatsappPhone: process.env.WHATSAPP_PHONE || "",
  urgentCall: String(process.env.URGENT_CALL || "").toLowerCase() === "true",
  sendOutreach: String(process.env.SEND_OUTREACH || "").toLowerCase() === "true",
  sendCap: Number(process.env.DAILY_SEND_CAP || 25),
  targetCities: (process.env.TARGET_CITIES || "Dubai,London,New York").split(",").map((x) => x.trim()).filter(Boolean),
};

// Services you sell. Keep in sync with the playbook.
const SERVICE_KEYWORDS = {
  "AI agents": ["ai agent", "agentic", "multi-agent", "autonomous agent", "llm agent", "rag", "ai assistant"],
  "Workflow automation": ["n8n", "make.com", "make com", "zapier", "power automate", "workflow automation", "business process automation", "automation engineer", "airtable automation"],
  "Chatbots & voice": ["chatbot", "voice agent", "ai receptionist", "vapi", "retell", "voice ai", "conversational ai"],
  "Data & scraping": ["web scraping", "scraper", "data extraction", "lead enrichment", "data pipeline", "crawler", "apify"],
  "Dashboards & internal tools": ["dashboard", "internal tool", "looker studio", "power bi", "retool", "reporting automation"],
  "CRM automation": ["gohighlevel", "go high level", "hubspot automation", "salesforce automation", "crm automation", "pipedrive"],
};

const HIRING_SIGNALS = ["hiring", "[hiring]", "we're looking", "we are looking", "looking for", "seeking", "need a", "need an", "contract", "freelance", "project", "budget", "available for", "rfq", "quote"];
const STRONG_HIRING = ["looking for", "hiring", "seeking", "need a", "need an", "we need", "we're looking", "we are looking", "want to hire", "recruit", "position", "vacancy", "rfq", "quote for", "contractor", "freelancer required", "freelancer needed"];
const SELLER_PATTERNS = [/\bi'?m (a|an)\b/, /\bi am (a|an)\b/, /\bmy name is\b/, /\bceo of\b/, /\bfounder of\b/, /\bwe specialize in\b/, /\bi specialize in\b/, /\bi help (businesses|founders|teams|agencies|companies|clients)\b/, /\bi work with (law|clients|businesses|founders)\b/, /\bcertified\b/, /\bmy portfolio\b/, /\bhire me\b/];

function classify(blob, title) {
  const t = `${title} ${blob}`.toLowerCase().replace(/[\u2018\u2019]/g, "'");
  const explicit = COMPETITOR_SIGNALS.some((k) => t.includes(k));
  const strongHiring = STRONG_HIRING.some((k) => t.includes(k));
  const seller = SELLER_PATTERNS.some((re) => re.test(t));
  const sellerAtStart = SELLER_PATTERNS.some((re) => re.test(t.slice(0, 90)));
  const isMeta = /^(about|welcome|rules|read this|introductions?)\b/i.test(String(title).trim());
  const isCompetitor = explicit || sellerAtStart || (seller && !strongHiring) || isMeta;
  const isHiring = !isCompetitor && strongHiring;
  return { isCompetitor, isHiring };
}
const COMPETITOR_SIGNALS = ["[for hire]", "for hire", "available for projects", "my portfolio", "i build", "i specialize", "i can help you", "hire me", "my n8n profile", "seeking internship", "looking for internship", "seeking an internship", "looking for a job", "available for work", "open to work", "freelancer seeking"];

// ---------------------------------------------------------------- helpers
const strip = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const daysAgo = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000;

function extractBudget(text) {
  const t = String(text || "");
  const m = t.match(/\$\s?([\d,]+(?:\.\d+)?)\s?([kK])?/);
  if (!m) {
    const inr = t.match(/inr\s?([\d.]+)\s?l/i);
    if (inr) return Math.round(parseFloat(inr[1]) * 100000 / 83);
    return null;
  }
  let v = parseFloat(m[1].replace(/,/g, ""));
  if (m[2]) v *= 1000;
  return Number.isFinite(v) ? Math.round(v) : null;
}

function matchServices(text) {
  const t = String(text || "").toLowerCase();
  const hits = [];
  for (const [svc, kws] of Object.entries(SERVICE_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) hits.push(svc);
  }
  return hits;
}

function scoreLead(lead) {
  const t = (lead.title + " " + lead.description).toLowerCase();
  let score = 0;
  score += lead.services.length * 12;                       // fit
  if (lead.isHiring) score += 15;                          // clear buyer intent
  if (lead.budget) score += lead.budget >= 1000 ? 25 : lead.budget >= 250 ? 18 : 8;
  if (lead.ageDays <= 2) score += 15;                      // fresh
  else if (lead.ageDays <= 7) score += 8;
  else if (lead.ageDays <= 21) score += 3;
  if (/\b(remote|anywhere|worldwide|us|usa|uk|europe)\b/.test(t)) score += 4;
  if (lead.isCompetitor) score -= 60;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function draftOutreach(lead, cfg) {
  const svc = lead.services[0] || "AI automation";
  const subject = lead.budget
    ? `${lead.title.slice(0, 55)} — fixed-scope plan`
    : `Quick idea for "${lead.title.slice(0, 45)}"`;
  const body = [
    `Hi,`,
    ``,
    `Saw your post: "${lead.title}". This is exactly the kind of ${svc.toLowerCase()} work I do.`,
    ``,
    `Here is how I would approach it:`,
    `1. A short scoping call to lock the outcome (30 min).`,
    `2. A working prototype delivered in 48-72h.`,
    `3. Handover with documentation, plus optional ongoing support.`,
    ``,
    lead.budget
      ? `Your listed budget of $${lead.budget} works for a fixed-scope pilot.`
      : `I usually start with a small fixed-price pilot ($150-$500) so you can see it working before committing further.`,
    ``,
    `Three questions so I can quote precisely: what does success look like, which tools are already in place, and what is your deadline?`,
    ``,
    `Reply here or email me and I will send a 2-minute walkthrough of a near-identical build.`,
    ``,
    cfg.paymentLink
      ? `Reserve the pilot here (pay and I start immediately): ${cfg.paymentLink}`
      : cfg.paypalEmail
        ? `Payment (PayPal): ${cfg.paypalEmail} — ${cfg.pilotPrice ? "$" + cfg.pilotPrice : ""} pilot.`
        : ``,
    `Best,`,
  ].filter((l) => l !== undefined).join("\n");
  return { subject, body };
}

// ---------------------------------------------------------------- sources
async function getJSON(url, opts = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { "user-agent": "lead-engine/1.0 (+github)", ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fromDiscourse(base, categoryPath, sourceName) {
  const url = `${base}${categoryPath}.json`;
  const d = await getJSON(url);
  const topics = d?.topic_list?.topics || [];
  return topics.map((tp) => ({
    id: `${sourceName}-${tp.id}`,
    source: sourceName,
    title: strip(tp.title),
    description: strip(tp.excerpt || ""),
    url: `${base}/t/${tp.slug}/${tp.id}`,
    detailBase: base,
    topicId: tp.id,
    postedAt: tp.created_at,
    raw: strip(tp.title),
  }));
}

async function fromHackerNews() {
  // Find the newest "Ask HN: Who is hiring?" thread, then pull its comments.
  const since = Math.floor(Date.now() / 1000) - 75 * 86400;
  const s = await getJSON("https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=8&numericFilters=created_at_i>" + since + "&query=" + encodeURIComponent("Ask HN: Who is hiring?"));
  const story = (s?.hits || []).sort((a, b) => b.created_at_i - a.created_at_i)[0];
  if (!story) return [];
  const d = await getJSON(`https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${story.objectID}&hitsPerPage=150`);
  return (d?.hits || []).map((h) => ({
    id: `hn-${h.objectID}`,
    source: "Hacker News",
    title: strip(h.comment_text || "").slice(0, 120) || "HN hiring comment",
    description: strip(h.comment_text || "").slice(0, 900),
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    postedAt: h.created_at,
    raw: strip(h.comment_text || ""),
  }));
}

async function fetchDiscourseDetail(lead) {
  if (!lead.detailBase || !lead.topicId) return null;
  try {
    const d = await getJSON(`${lead.detailBase}/t/${lead.topicId}.json`, {}, 15000);
    const post = d?.post_stream?.posts?.[0];
    return post ? strip(post.cooked) : null;
  } catch {
    return null;
  }
}

async function fromRemoteOK() {
  const d = await getJSON("https://remoteok.com/api");
  return (Array.isArray(d) ? d.slice(1) : []).map((j) => ({
    id: `rok-${j.id}`,
    source: "RemoteOK",
    title: strip(j.position),
    description: strip(j.description || "").slice(0, 600),
    url: j.url || j.apply_url || "https://remoteok.com",
    postedAt: j.date || new Date().toISOString(),
    raw: `${strip(j.position)} ${strip((j.tags || []).join(" "))}`,
  }));
}

async function fromRemotive() {
  const d = await getJSON("https://remotive.com/api/remote-jobs?search=automation&limit=50");
  return (d?.jobs || []).map((j) => ({
    id: `rem-${j.id}`,
    source: "Remotive",
    title: strip(j.title),
    description: strip(j.description || "").slice(0, 600),
    url: j.url,
    postedAt: j.publication_date,
    raw: `${strip(j.title)} ${strip((j.tags || []).join(" "))}`,
  }));
}

const SOURCES = [
  { name: "n8n Community", fn: () => fromDiscourse("https://community.n8n.io", "/c/jobs/13", "n8n Community") },
  { name: "Make.com Community", fn: () => fromDiscourse("https://community.make.com", "/latest", "Make.com Community") },
  { name: "Hacker News", fn: fromHackerNews },
  { name: "RemoteOK", fn: fromRemoteOK },
  { name: "Remotive", fn: fromRemotive },
  { name: "OpenStreetMap", fn: () => fromOsmBusinesses({ cities: CONFIG.targetCities, limitPerCity: 40 }) },
  { name: "Google Maps", fn: () => fromGooglePlaces({}) },
];

// ---------------------------------------------------------------- main
async function main() {
  const collected = [];
  const sourceStats = {};

  for (const s of SOURCES) {
    try {
      const items = await s.fn();
      sourceStats[s.name] = items.length;
      collected.push(...items);
    } catch (err) {
      sourceStats[s.name] = `error: ${err.message}`;
      console.error(`[source:${s.name}] ${err.message}`);
    }
  }

  // dedupe by id
  const seen = new Set();
  const unique = collected.filter((l) => (seen.has(l.id) ? false : seen.add(l.id)));

  // enrich
  const enriched = unique.map((l) => {
    const blob = `${l.title} ${l.description}`;
    const isEmailLead = !!l._emailLead;
    const services = isEmailLead ? (l.services || ["AI automation"]) : matchServices(blob);
    const titleServices = isEmailLead ? services : matchServices(l.title);
    const { isCompetitor, isHiring } = isEmailLead
      ? { isCompetitor: false, isHiring: true }
      : classify(blob, l.title);
    const budget = extractBudget(blob);
    const ageDays = Math.round(daysAgo(l.postedAt)) || 0;
    const lead = { ...l, services, titleServices, isCompetitor, isHiring, budget, ageDays };
    lead.score = scoreLead(lead);
    return lead;
  });

  // Fill in missing emails by reading each business's own website
  const missing = enriched.filter((l) => l.website && !l.email);
  if (missing.length) {
    try {
      const r = await enrichEmails(missing, { concurrency: 8 });
      console.log(`Website enrichment: checked ${r.checked}, found ${r.filled} emails, ${r.mobiles || 0} mobiles`);
    } catch (e) { console.error(`Enrichment failed: ${e.message}`); }
  }

  // pre-qualify by title/services, then enrich the best candidates with full post text
  const STRICT_TITLE_SOURCES = ["RemoteOK", "Remotive"];
  const candidates = enriched
    .filter((l) => l.services.length > 0 && !l.isCompetitor)
    .filter((l) => !STRICT_TITLE_SOURCES.includes(l.source) || (l.titleServices || []).length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(CONFIG.dailyTarget * 2, 40));

  // bounded concurrency enrichment (Discourse full post body -> real description + budget)
  const queue = candidates.filter((l) => l.detailBase && l.topicId);
  const limit = 6;
  for (let i = 0; i < queue.length; i += limit) {
    await Promise.all(queue.slice(i, i + limit).map(async (l) => {
      const full = await fetchDiscourseDetail(l);
      if (full) {
        l.description = full.slice(0, 1200);
        const blob = `${l.title} ${l.description}`;
        l.services = matchServices(blob);
        l.titleServices = matchServices(l.title);
        const c = classify(blob, l.title);
        l.isCompetitor = c.isCompetitor;
        l.isHiring = c.isHiring;
        l.budget = extractBudget(blob);
        l.score = scoreLead(l);
      }
      delete l.detailBase;
      delete l.topicId;
    }));
  }

  // qualify
  let qualified = candidates
    .filter((l) => l.services.length > 0 && !l.isCompetitor)
    .filter((l) => !STRICT_TITLE_SOURCES.includes(l.source) || (l.titleServices || []).length > 0)
    .filter((l) => l.isHiring || l.budget)
    .filter((l) => l._emailLead ? true : (CONFIG.minBudget > 0 ? (l.budget || 0) >= CONFIG.minBudget : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFIG.dailyTarget);

  qualified = qualified.map((l) => ({
    ...l,
    outreach: l.email ? buildEmail(l, CONFIG) : draftOutreach(l, CONFIG),
    status: "new",
  }));

  const pipelineValue = qualified.reduce((sum, l) => sum + (l.budget || 0), 0);

  const payload = {
    generatedAt: new Date().toISOString(),
    config: CONFIG,
    stats: {
      totalScanned: enriched.length,
      qualified: qualified.length,
      pipelineValue,
      sources: sourceStats,
      payoutGoal: CONFIG.payoutGoal,
    },
    leads: qualified,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${qualified.length} qualified leads -> ${OUT_FILE}`);

  // alert: WhatsApp the moment customers are found
  if (CONFIG.whatsappPhone && qualified.length) {
    try {
      const r = await alertNewLeads(qualified, payload.stats);
      console.log(`WhatsApp alert: ${r.sent ? "sent via " + r.transport : "logged only (" + (r.reason || r.status) + ")"}`);
      // optional urgent voice call for genuinely hot buyers (costs a call credit)
      if (CONFIG.urgentCall) {
        const hot = qualified.filter((l) => l.score >= 70);
        if (hot.length) {
          const c = await alertPhoneCall(`Lead Machine urgent. ${hot.length} hot buyer lead${hot.length > 1 ? "s" : ""} found. Top: ${hot[0].title}. Open your dashboard to close.`);
          console.log(`Urgent call: ${c.sent ? "placed" : "failed " + (c.reason || c.status)}${c.balance ? " | balance: " + c.balance : ""}`);
        }
      }
    } catch (e) {
      console.error(`WhatsApp alert failed: ${e.message}`);
    }
  }

  // ---- WhatsApp readiness (mobile numbers only) ----
  try {
    const wa = annotateWhatsApp(qualified);
    payload.stats.whatsappCapable = wa.waCapable;
    payload.stats.phoneLeads = qualified.filter((l) => l.phone).length;
    console.log(`WhatsApp: ${wa.waCapable} of ${wa.total} leads have a mobile number`);
  } catch (e) { console.error(`WhatsApp annotate failed: ${e.message}`); }

  // ---- outbound sending (only to leads with a real published email) ----
  const emailLeads = qualified.filter((l) => l.email);
  payload.stats.emailLeads = emailLeads.length;
  if (CONFIG.sendOutreach && emailLeads.length) {
    try {
      const r = await sendOutreach(emailLeads, { cap: CONFIG.sendCap });
      payload.stats.sent = r.sent;
      payload.stats.sendSkipped = r.skipped || 0;
      console.log(`Outreach: sent ${r.sent}/${r.attempted || emailLeads.length}${r.reason ? " (" + r.reason + ")" : ""}`);
    } catch (e) {
      console.error(`Outreach failed: ${e.message}`);
    }
  } else if (emailLeads.length) {
    console.log(`Outreach: ${emailLeads.length} email leads ready (set SEND_OUTREACH=true + RESEND_API_KEY to send)`);
  }

  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2), "utf8");

  // optional digest
  if (CONFIG.digestEmail && process.env.RESEND_API_KEY) {
    const rows = qualified.slice(0, 12).map((l, i) =>
      `${i + 1}. [${l.score}] ${l.title} — ${l.source}${l.budget ? ` — $${l.budget}` : ""}\n   ${l.url}`
    ).join("\n");
    const body = [
      `Lead Engine daily digest — ${new Date().toDateString()}`,
      ``,
      `Scanned: ${payload.stats.totalScanned}`,
      `Qualified: ${qualified.length}`,
      `Pipeline value: $${pipelineValue.toLocaleString()}`,
      `Goal: $${CONFIG.payoutGoal}`,
      ``,
      `Top leads:`,
      rows,
      ``,
      `Human-only actions: log into Upwork/marketplaces to submit proposals, book calls, close deals.`,
    ].join("\n");
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: process.env.DIGEST_FROM || "Lead Engine <onboarding@resend.dev>", to: [CONFIG.digestEmail], subject: `Lead Engine: ${qualified.length} qualified leads, $${pipelineValue.toLocaleString()} pipeline`, text: body }),
      });
      console.log(`Digest email -> ${r.status}`);
    } catch (e) {
      console.error(`Digest failed: ${e.message}`);
    }
  } else if (CONFIG.digestEmail) {
    console.log("Digest email skipped (set RESEND_API_KEY to enable).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
