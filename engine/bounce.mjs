#!/usr/bin/env node
/**
 * engine/bounce.mjs — closes the deliverability loop.
 *
 * Reads its OWN inbox via IMAP, finds delivery-failure notices, then:
 *   1. extracts every address that failed
 *   2. suppresses it forever (data/optout.json)
 *   3. suppresses the whole DOMAIN when the failure was a spam block
 *   4. records the bounce so the guard can pause sending
 *
 * This is why the guard never fired before: GitHub Actions had no way to see bounces.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchRecentHeaders } from "./imap.mjs";
import { recordBounces } from "./health.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const BOUNCE_FROM = /(mailer-daemon|mail-delivery|postmaster|maildaemon)/i;
const FAILED = [
  /to\s+<?([\w.+-]+@[\w.-]+\.\w+)>?\s+(?:couldn|was|has been|is)/i,
  /Your message to\s+<?([\w.+-]+@[\w.-]+\.\w+)>?/i,
  /delivered to\s+<?([\w.+-]+@[\w.-]+\.\w+)>?/i,
  /([\w.+-]+@[\w.-]+\.\w+)\s+because/i,
];
const FREEMAIL = new Set(["gmail.com","googlemail.com","yahoo.com","yahoo.co.uk","hotmail.com","outlook.com","live.com","msn.com","aol.com","icloud.com","me.com","protonmail.com","proton.me","gmx.com","gmx.de","mail.com","yandex.com","yandex.ru","zoho.com","qq.com","163.com","126.com","web.de","t-online.de"]);
const SPAM_BLOCK = /(high probability of spam|blocked|blacklist|spam|550|554|reputation)/i;

const load = async (f, d) => { try { return JSON.parse(await readFile(resolve(ROOT, f), "utf8")); } catch { return d; } };
const save = async (f, v) => { await mkdir(dirname(resolve(ROOT, f)), { recursive: true }); await writeFile(resolve(ROOT, f), JSON.stringify(v, null, 2), "utf8"); };

export async function processBounces({ days = 3 } = {}) {
  const inbox = await fetchRecentHeaders({ days });
  if (!inbox.ok) return { ok: false, reason: inbox.reason };

  const optout = await load("data/optout.json", []);
  const block = await load("data/domain-block.json", { domains: [] });
  const haveEmail = new Set(optout.map((x) => (x.email || "").toLowerCase()));
  const haveDomain = new Set((block.domains || []).map((d) => d.toLowerCase()));

  const fresh = [];
  const newDomains = [];

  for (const m of inbox.messages) {
    if (!BOUNCE_FROM.test(m.from)) continue;
    const blob = `${m.subject || ""} ${m.body || ""}`;
    let addr = "";
    for (const re of FAILED) { const x = blob.match(re); if (x) { addr = x[1].toLowerCase(); break; } }
    if (!addr || haveEmail.has(addr)) continue;

    const isSpam = SPAM_BLOCK.test(blob);
    const reason = isSpam ? "bounced: spam block" : "bounced: undeliverable";
    optout.push({ email: addr, reason, at: new Date().toISOString() });
    haveEmail.add(addr);
    fresh.push({ email: addr, reason });

    // a spam block is about the DOMAIN, not the mailbox — block the whole host
    if (isSpam) {
      const dom = addr.split("@")[1];
      // NEVER block a freemail provider: one spam-blocked Gmail user must not
      // cut off every Gmail address on earth. That is a mailbox problem, not a host problem.
      if (dom && !FREEMAIL.has(dom) && !haveDomain.has(dom)) { haveDomain.add(dom); newDomains.push(dom); }
    }
  }

  if (fresh.length) {
    await save("data/optout.json", optout);
    await recordBounces(fresh.map((f) => f.email));
  }
  if (newDomains.length) {
    block.domains = [...new Set([...(block.domains || []), ...newDomains])];
    block.note = "auto-added: hosts that spam-blocked us";
    await save("data/domain-block.json", block);
  }
  return { ok: true, scanned: inbox.messages.length, suppressed: fresh, newDomains };
}
