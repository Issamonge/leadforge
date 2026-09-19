#!/usr/bin/env node
/**
 * engine/health.mjs — protects the sending account.
 * If the bounce rate over the last N sends crosses a threshold, the engine
 * stops sending. Losing your Gmail is far worse than skipping a day.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(ROOT, "data/health.json");
const MAX_BOUNCE_RATE = Number(process.env.MAX_BOUNCE_RATE || 0.08);  // 8%
const WINDOW = 100;

export async function loadHealth() { try { return JSON.parse(await readFile(FILE, "utf8")); } catch { return { sends: [], bounces: [] }; } }
export async function saveHealth(h) { await mkdir(dirname(FILE), { recursive: true }); await writeFile(FILE, JSON.stringify(h, null, 2), "utf8"); }

export function bounceRate(h) {
  const n = Math.min(h.sends.length, WINDOW);
  if (n < 20) return 0;                                  // not enough data yet
  const recent = h.sends.slice(-n);
  const cutoff = new Date(recent[0]).getTime();
  const b = h.bounces.filter((x) => new Date(x) >= cutoff).length;
  return b / n;
}

/** Should we send today? */
export async function sendingAllowed() {
  const h = await loadHealth();
  const rate = bounceRate(h);
  if (rate > MAX_BOUNCE_RATE) {
    return { allowed: false, rate, reason: `bounce rate ${(rate * 100).toFixed(1)}% exceeds ${MAX_BOUNCE_RATE * 100}% — pausing sends to protect the account` };
  }
  return { allowed: true, rate };
}

export async function recordSends(emails) {
  const h = await loadHealth();
  const now = new Date().toISOString();
  emails.forEach(() => h.sends.push(now));
  h.sends = h.sends.slice(-500);
  await saveHealth(h);
}
export async function recordBounces(emails) {
  const h = await loadHealth();
  emails.forEach(() => h.bounces.push(new Date().toISOString()));
  h.bounces = h.bounces.slice(-500);
  await saveHealth(h);
}
