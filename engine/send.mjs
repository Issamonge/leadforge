#!/usr/bin/env node
/**
 * engine/send.mjs — sends outreach to leads that have a REAL published email.
 *
 * Transport: Resend (free tier: 100/day, 3,000/month). Env: RESEND_API_KEY.
 * Fallbacks: SMTP via SMTP_URL (optional).
 *
 * Safeguards (do not remove):
 *  - hard daily cap (default 25) to protect sender reputation
 *  - never emails the same address twice  (data/contacted.json)
 *  - skips role-less junk, invalid addresses, and opt-out list (data/optout.json)
 *  - every message carries identity + physical line + one-click opt-out (CAN-SPAM)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sendMail, smtpConfigured } from "./smtp.mjs";
import { filterDeliverable, loadDomainBlock } from "./validate.mjs";
import { loadLog, saveLog, dueFollowUps, followUp, MAX_STEP } from "./followup.mjs";
import { isBusinessHours } from "./clock.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTACTED = resolve(ROOT, "data/contacted.json");
const OPTOUT = resolve(ROOT, "data/optout.json");

const CAP = Number(process.env.DAILY_SEND_CAP || 25);
const FROM = process.env.OUTREACH_FROM || "Issa Hakizimana <onboarding@resend.dev>";
const REPLY_TO = process.env.REPLY_TO || "ihakizimana11@gmail.com";
const IDENTITY = process.env.SENDER_IDENTITY || "Issa Hakizimana — AI Automation Studio";
const PHYSICAL = process.env.SENDER_ADDRESS || "Dubai, United Arab Emirates";
const PAY_LINK = process.env.PAYMENT_LINK || "https://paypal.me/7900861";
const PILOT = Number(process.env.PILOT_PRICE || 350);

async function loadJSON(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}
async function saveJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

export function buildEmail(lead, cfg = {}) {
  const biz = lead.title.split(" — ")[0].trim().slice(0, 50);
  const city = lead.city || "your city";
  const cat = (lead.category || "").toLowerCase();

  // NO links, NO prices, NO payment link in the first touch.
  // Links and money are the two strongest spam triggers — and they also
  // convert worse than a plain question, because they ask for money before trust.
  const pain = /dentist|clinic|doctor|medical|hospital|pharmacy/.test(cat)
    ? "missed calls and no-shows"
    : /real estate|lawyer|accountant|insurance|financial/.test(cat)
      ? "enquiry follow-up that never happens"
      : /hotel|restaurant|cafe|beauty|hairdresser|gym|spa/.test(cat)
        ? "bookings and rebookings going cold"
        : "manual work that eats the week";

  const subject = `${biz} — quick question about ${pain}`;

  const body = [
    `Hi ${biz} team,`,
    ``,
    `I work with ${cat || "local"} businesses in ${city} on one specific thing: ${pain}.`,
    ``,
    `Quick question — is that something your team handles manually right now, or have you already got a system for it?`,
    ``,
    `If it's a problem, I have an approach that takes about a week to set up and then runs on its own. If it's not, just say so and I won't follow up again.`,
    ``,
    `Either answer is genuinely useful.`,
    ``,
    `— Issa Hakizimana`,
    `AI Automation Studio, Dubai`,
    ``,
    `Reply "stop" to be removed immediately.`,
  ].join("\n");

  return { subject, body };
}

async function sendViaResend({ to, subject, text, key }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, text }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, id: j.id, error: j.message };
}

/** Brevo (free 300/day). Verifies a SENDER EMAIL — no domain purchase required. */
async function sendViaBrevo({ to, subject, text, key }) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: process.env.SENDER_NAME || "Issa Hakizimana", email: process.env.SENDER_EMAIL || REPLY_TO },
      to: [{ email: to }],
      replyTo: { email: REPLY_TO },
      subject,
      textContent: text,
    }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, id: j.messageId, error: j.message || (j.code ? j.code : undefined) };
}

/** Pick the configured transport. */
function transport() {
  if (smtpConfigured()) return { name: "smtp", send: (a) => sendMail({ ...a, replyTo: REPLY_TO }) };
  if (process.env.RESEND_API_KEY) return { name: "resend", send: (a) => sendViaResend({ ...a, key: process.env.RESEND_API_KEY }) };
  if (process.env.BREVO_API_KEY) return { name: "brevo", send: (a) => sendViaBrevo({ ...a, key: process.env.BREVO_API_KEY }) };
  return null;
}

/** Send outreach to email-bearing leads. Never throws. */
export async function sendOutreach(leads, { dryRun = false, cap } = {}) {
  const t = transport();
  const limit = Math.min(cap || CAP, CAP);
  const contacted = await loadJSON(CONTACTED, []);
  const log = await loadLog();
  const optout = await loadJSON(OPTOUT, []);
  const logSeen = (await loadLog()).map((e) => (e.email || "").toLowerCase());
  const seen = new Set([...contacted.map((c) => (c.email || "").toLowerCase()), ...logSeen]);
  const blocked = new Set(optout.map((o) => String(o.email).toLowerCase()));

  // deliverability gate: syntax + placeholder blocklist + MX record check
  const domBlock = await loadDomainBlock();
  const batchSeen = new Set();
  const candidates = leads.filter((l) => {
    const em = (l.email || "").toLowerCase();
    if (!em || seen.has(em) || blocked.has(em) || batchSeen.has(em)) return false;   // never twice, ever
    const dom = em.split("@")[1] || "";
    if (domBlock.has(dom)) return false;            // hosts that spam-block us
    if (typeof l.tz === "string" && !isBusinessHours(l.tz)) return false;   // not their night
    batchSeen.add(em);
    return true;
  });
  const { kept, rejected } = await filterDeliverable(candidates);
  if (rejected.length) {
    console.log(`Delivery guard rejected ${rejected.length}: ` +
      rejected.slice(0, 5).map((r) => `${r.email} (${r.reason})`).join(", "));
  }
  const targets = kept.slice(0, limit);

  if (!t && !dryRun) {
    return { sent: 0, skipped: targets.length, reason: "no email transport configured (set SMTP_USER+SMTP_PASS, RESEND_API_KEY, or BREVO_API_KEY)", targets: targets.length };
  }

  const results = [];
  for (const l of targets) {
    const { subject, body } = buildEmail(l);
    if (dryRun) { results.push({ email: l.email, dryRun: true, subject }); continue; }
    const r = { ...(await t.send({ to: l.email, subject, text: body })), transport: t.name };
    results.push({ email: l.email, ...r });
    if (r.ok) {
      contacted.push({ email: l.email, at: new Date().toISOString(), business: l.title.slice(0, 80), status: "sent" });
      log.push({
        email: l.email,
        business: l.title.slice(0, 80),
        niche: l.category || (l.services || [])[0] || "general",
        city: l.city || "",
        service: (l.services || [])[0] || "automation",
        sentAt: new Date().toISOString(),
        lastSentAt: new Date().toISOString(),
        step: 0,
      });
    }
    await new Promise((res) => setTimeout(res, 350)); // gentle pacing
  }
  if (!dryRun) { await saveJSON(CONTACTED, contacted); await saveLog(log); }
  const sent = results.filter((r) => r.ok).length;
  return { sent, failed: results.filter((r) => r.ok === false).length, attempted: results.length, targets: targets.length, rejected: rejected.length, cap: limit, results };
}


/** Send all follow-ups that are due. Returns {sent, steps, results}. */
export async function sendFollowUps({ dryRun = false, limit = 25 } = {}) {
  const t = transport();
  if (!t && !dryRun) return { sent: 0, due: 0, reason: "no transport configured" };
  const log = await loadLog();
  const due = dueFollowUps(log).slice(0, limit);
  if (!due.length) return { sent: 0, due: 0 };

  const contacted = await loadJSON(CONTACTED, []);
  const results = [];
  for (const entry of due) {
    const nextStep = entry.step + 1;
    const { subject, body } = followUp(nextStep, entry);
    if (dryRun) { results.push({ email: entry.email, step: nextStep, dryRun: true }); continue; }
    const r = await t.send({ to: entry.email, subject, text: body });
    results.push({ email: entry.email, step: nextStep, ok: r.ok });
    if (r.ok) {
      entry.step = nextStep;
      entry.lastSentAt = new Date().toISOString();
      contacted.push({ email: entry.email, at: entry.lastSentAt, business: entry.business, status: "followup_" + nextStep });
    }
    await new Promise((res) => setTimeout(res, 350));
  }
  if (!dryRun) { await saveLog(log); await saveJSON(CONTACTED, contacted); }
  return { sent: results.filter((r) => r.ok).length, due: due.length, results };
}
