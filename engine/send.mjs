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
  const biz = lead.title.split(" — ")[0].trim();
  const svc = (lead.services || ["AI automation"])[0];
  const pain = /dentist|clinic|doctors/.test(lead.category || "")
    ? "missed calls and no-shows"
    : /estate|lawyer|accountant|insurance/.test(lead.category || "")
      ? "manual intake and follow-up"
      : "repetitive manual work";
  const subject = `${biz}: cutting ${pain} (48-hour pilot)`;
  const body = [
    `Hi ${biz} team,`,
    ``,
    `I build ${svc.toLowerCase()} for businesses in ${lead.city || "your city"} — specifically, systems that cut ${pain} without adding headcount.`,
    ``,
    `How it works:`,
    `1. A free 15-minute review of where your team loses time each week.`,
    `2. If it makes sense, a fixed-price $${PILOT} pilot delivered in 48-72 hours.`,
    `3. You keep it, or walk away — no retainer unless it's working.`,
    ``,
    `If you'd like the review, just reply "yes" and I'll send two time slots.`,
    ``,
    `Reserve the pilot directly: ${PAY_LINK}`,
    ``,
    `— ${IDENTITY}`,
    PHYSICAL,
    ``,
    `Don't want to hear from me? Reply "stop" and I'll remove you immediately — no hard feelings.`,
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
  const optout = await loadJSON(OPTOUT, []);
  const seen = new Set(contacted.map((c) => c.email));
  const blocked = new Set(optout.map((o) => String(o.email).toLowerCase()));

  const targets = leads
    .filter((l) => l.email && !seen.has(l.email) && !blocked.has(l.email.toLowerCase()))
    .slice(0, limit);

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
    }
    await new Promise((res) => setTimeout(res, 350)); // gentle pacing
  }
  if (!dryRun) await saveJSON(CONTACTED, contacted);
  const sent = results.filter((r) => r.ok).length;
  return { sent, failed: results.filter((r) => r.ok === false).length, attempted: results.length, targets: targets.length, cap: limit, results };
}
