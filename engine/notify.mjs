#!/usr/bin/env node
/**
 * notify.mjs — sends WhatsApp alerts when the engine finds customers
 * or when a lead needs a human to close.
 *
 * Two transports (either or both):
 *   1. CallMeBot   — simplest, free, personal WhatsApp. Env: CALLMEBOT_API_KEY, WHATSAPP_PHONE
 *   2. Twilio      — production-grade WhatsApp Business. Env: TWILIO_SID, TWILIO_TOKEN, TWILIO_WHATSAPP_FROM, WHATSAPP_PHONE
 *
 * If neither is configured, alerts are written to data/alerts.json so the
 * dashboard still shows them.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALERTS = resolve(ROOT, "data/alerts.json");

export function money(n) { return "$" + Number(n || 0).toLocaleString(); }

async function logAlert(alert) {
  let list = [];
  try { list = JSON.parse(await readFile(ALERTS, "utf8")); } catch { list = []; }
  list.unshift(alert);
  list = list.slice(0, 100);
  await mkdir(resolve(ROOT, "data"), { recursive: true });
  await writeFile(ALERTS, JSON.stringify(list, null, 2), "utf8");
}

async function sendCallMeBot(text) {
  const key = process.env.CALLMEBOT_API_KEY;
  const phone = process.env.WHATSAPP_PHONE;
  if (!key || !phone) return { sent: false, reason: "callmebot not configured" };
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url);
    const body = await r.text();
    return { sent: r.ok, transport: "callmebot", status: r.status, body: body.slice(0, 120) };
  } catch (e) { return { sent: false, reason: e.message }; }
}

async function sendTwilio(text) {
  const sid = process.env.TWILIO_SID, token = process.env.TWILIO_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM, to = process.env.WHATSAPP_PHONE;
  if (!sid || !token || !from || !to) return { sent: false, reason: "twilio not configured" };
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: `whatsapp:${from}`, To: `whatsapp:${to}`, Body: text }).toString(),
    });
    return { sent: r.ok, transport: "twilio", status: r.status };
  } catch (e) { return { sent: false, reason: e.message }; }
}

/** Send a WhatsApp alert. Returns { sent, transport }. Always logs locally. */
export async function alertWhatsApp(text, meta = {}) {
  await logAlert({ at: new Date().toISOString(), text, ...meta });
  if (process.env.TWILIO_SID) {
    const t = await sendTwilio(text);
    if (t.sent) return t;
  }
  return await sendCallMeBot(text);
}

/** One-way urgent phone call (CallMeBot call.php). Calls YOUR number and speaks. */
export async function alertPhoneCall(text) {
  const key = process.env.CALLMEBOT_API_KEY;
  const phone = String(process.env.WHATSAPP_PHONE || "").replace(/^\+/, "");
  if (!key || !phone) return { sent: false, reason: "call api not configured" };
  const body = String(text).replace(/[\r\n]+/g, ". ").slice(0, 256);
  const url = `https://api.callmebot.com/call.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(body)}&apikey=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url);
    const b = await r.text();
    const bal = (b.match(/Balance is:\s*([^<]+)/i) || [])[1];
    return { sent: r.ok, transport: "callmebot-call", status: r.status, balance: bal ? bal.trim() : undefined };
  } catch (e) { return { sent: false, reason: e.message }; }
}

/** Compose + send the "new customers found" digest alert. */
export async function alertNewLeads(leads, stats) {
  const hot = leads.filter((l) => l.score >= 65);
  const lines = [
    `*Lead Machine* — ${new Date().toLocaleString()}`,
    ``,
    `Scanned ${stats.totalScanned} · qualified *${leads.length}*`,
    `Listed pipeline: ${money(stats.pipelineValue)}`,
    ``,
  ];
  if (hot.length) {
    lines.push(`*HOT — needs your closing:*`);
    hot.slice(0, 4).forEach((l, i) => {
      lines.push(`${i + 1}. [${l.score}] ${l.title.slice(0, 80)}`);
      lines.push(`   ${l.source}${l.budget ? " · " + money(l.budget) : ""}`);
      lines.push(`   ${l.url}`);
    });
  } else {
    lines.push(`Top lead: ${leads[0] ? leads[0].title.slice(0, 90) : "none"}`);
  }
  lines.push(``, `Reply "1" to log a contact, "2" to see all leads.`);
  return alertWhatsApp(lines.join("\n"), { kind: "new_leads", count: leads.length, hot: hot.length });
}
