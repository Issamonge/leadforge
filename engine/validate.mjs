#!/usr/bin/env node
/**
 * engine/validate.mjs — stops bad addresses BEFORE they bounce.
 *
 * Three layers:
 *  1. syntax + placeholder/role blocklist  (catches johndoe@info.com etc.)
 *  2. domain blocklist                     (example.com, info.com, ...)
 *  3. MX record lookup via DNS             (catches dead domains like fdac.ae)
 *
 * MX results are cached in data/mx-cache.json so we don't re-query DNS.
 */
import { resolveMx } from "node:dns/promises";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MX_CACHE = resolve(ROOT, "data/mx-cache.json");
const CACHE_DAYS = 30;

const SYNTAX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Obvious placeholders / demo values that must never be mailed
const BAD_LOCAL = /^(johndoe|john\.doe|jane\.doe|johnsmith|yourname|your\.name|name|test|demo|sample|example|user|email|admin@example|noreply|no-reply|donotreply|postmaster|abuse|webmaster@localhost)$/i;
const BAD_DOMAIN = /(^|\.)(example\.com|example\.org|example\.net|info\.com|domain\.com|email\.com|yourdomain\.com|yoursite\.com|site\.com|test\.com|localhost|invalid|local)$/i;
const BAD_ANY = /(sentry|wixpress|godaddy|cloudflare|\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg|@2x|w3\.org|schema\.org)/i;

export function looksValid(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e || e.length > 254) return { ok: false, reason: "empty/too long" };
  if (!SYNTAX.test(e)) return { ok: false, reason: "syntax" };
  if (BAD_ANY.test(e)) return { ok: false, reason: "junk pattern" };
  const [local, domain] = e.split("@");
  if (!local || !domain) return { ok: false, reason: "syntax" };
  if (BAD_LOCAL.test(local)) return { ok: false, reason: "placeholder local-part" };
  if (BAD_DOMAIN.test(domain)) return { ok: false, reason: "placeholder domain" };
  if (domain.endsWith(".local") || domain.endsWith(".invalid")) return { ok: false, reason: "non-routable" };
  return { ok: true };
}

async function loadCache() { try { return JSON.parse(await readFile(MX_CACHE, "utf8")); } catch { return {}; } }
async function saveCache(c) { await mkdir(dirname(MX_CACHE), { recursive: true }); await writeFile(MX_CACHE, JSON.stringify(c, null, 2), "utf8"); }

/** Does the domain actually accept mail? (MX lookup, cached) */
export async function domainAcceptsMail(domain, cache) {
  const e = cache[domain];
  if (e && Date.now() - new Date(e.at).getTime() < CACHE_DAYS * 86400000) return e.ok;
  let ok = false;
  try {
    const mx = await resolveMx(domain);
    ok = Array.isArray(mx) && mx.length > 0;
  } catch { ok = false; }
  cache[domain] = { ok, at: new Date().toISOString() };
  return ok;
}

/** Filter a lead list down to addresses that will actually deliver. */
export async function filterDeliverable(leads, { checkMx = true } = {}) {
  const cache = await loadCache();
  const kept = [], rejected = [];
  for (const l of leads) {
    const v = looksValid(l.email);
    if (!v.ok) { rejected.push({ email: l.email, reason: v.reason }); continue; }
    if (checkMx) {
      const domain = l.email.split("@")[1];
      const ok = await domainAcceptsMail(domain, cache);
      if (!ok) { rejected.push({ email: l.email, reason: "no MX / dead domain" }); continue; }
    }
    kept.push(l);
  }
  await saveCache(cache);
  return { kept, rejected };
}

/** Domains that actively reject us (550 spam blocks, dead hosts). */
export async function loadDomainBlock() {
  try {
    const j = JSON.parse(await readFile(resolve(ROOT, "data/domain-block.json"), "utf8"));
    return new Set((j.domains || []).map((d) => d.toLowerCase()));
  } catch { return new Set(); }
}
