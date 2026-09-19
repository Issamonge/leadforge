#!/usr/bin/env node
/**
 * engine/imap.mjs — a zero-dependency IMAP client, just enough to read replies.
 *
 * Uses the same Gmail app password as the SMTP sender.
 * Lets the engine:
 *   - detect who replied (and alert you on WhatsApp immediately)
 *   - stop the follow-up sequence for anyone who answered
 *   - count replies per niche so the machine learns what sells
 *
 * Env: SMTP_USER / SMTP_PASS (reused), IMAP_HOST (default imap.gmail.com)
 */
import tls from "node:tls";

const HOST = process.env.IMAP_HOST || "imap.gmail.com";
const PORT = Number(process.env.IMAP_PORT || 993);

function connect() {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host: HOST, port: PORT, servername: HOST }, () => resolve(sock));
    sock.setMaxListeners(0);
    sock.setTimeout(30000, () => { sock.destroy(); reject(new Error("IMAP timeout")); });
    sock.once("error", reject);
  });
}

/** Line-oriented reader that resolves when a tagged command completes. */
function makeReader(sock) {
  let buf = "";
  const waiters = [];
  sock.on("data", (d) => {
    buf += d.toString("utf8");
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (new RegExp("^" + w.tag + " (OK|NO|BAD)", "m").test(buf)) {
        const res = buf; buf = ""; waiters.splice(i, 1); w.resolve(res);
      }
    }
  });
  return (tag) => new Promise((resolve, reject) => {
    waiters.push({ tag, resolve, reject });
    setTimeout(() => {
      const i = waiters.findIndex((w) => w.tag === tag);
      if (i >= 0) { waiters.splice(i, 1); reject(new Error("IMAP command timeout: " + tag)); }
    }, 30000);
  });
}

const q = (s) => '"' + String(s).replace(/"/g, '') + '"';

/** Fetch message headers SINCE a date. Returns [{from, subject, date, uid}]. */
export async function fetchRecentHeaders({ days = 14 } = {}) {
  const user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!user || !pass) return { ok: false, reason: "SMTP_USER/SMTP_PASS not set", messages: [] };

  let sock;
  try {
    sock = await connect();
    const read = makeReader(sock);
    let n = 0; const tag = () => "A" + ++n;
    const send = async (cmd) => { const t = tag(); sock.write(t + " " + cmd + "\r\n"); return await read(t); };

    await new Promise((r) => setTimeout(r, 300));           // greeting
    await send(`LOGIN ${q(user)} ${q(pass)}`);
    await send(`SELECT "INBOX"`);

    const since = new Date(Date.now() - days * 86400000)
      .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      .replace(/ /g, "-");                                   // e.g. 05-Sep-2026
    const search = await send(`UID SEARCH SINCE ${since}`);
    const uids = (search.match(/\* SEARCH ([0-9 ]*)/) || [])[1]?.trim().split(/\s+/).filter(Boolean) || [];
    if (!uids.length) { await send("LOGOUT"); sock.destroy(); return { ok: true, messages: [] }; }

    // fetch in batches to stay within server limits
    const messages = [];
    const batch = uids.slice(-120);
    for (let i = 0; i < batch.length; i += 40) {
      const set = batch.slice(i, i + 40).join(",");
      const res = await send(`UID FETCH ${set} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])`);
      for (const block of res.split(/\* \d+ FETCH/).slice(1)) {
        const from = (block.match(/^From:\s*(.+)$/mi) || [])[1]?.trim() || "";
        const subject = (block.match(/^Subject:\s*(.+)$/mi) || [])[1]?.trim() || "";
        const date = (block.match(/^Date:\s*(.+)$/mi) || [])[1]?.trim() || "";
        const uid = (block.match(/UID (\d+)/) || [])[1] || "";
        if (from) messages.push({ from, subject, date, uid });
      }
    }
    await send("LOGOUT").catch(() => {});
    sock.destroy();
    return { ok: true, messages };
  } catch (e) {
    try { sock?.destroy(); } catch {}
    return { ok: false, reason: e.message, messages: [] };
  }
}

export const extractAddress = (from) => (String(from).match(/<([^>]+)>/)?.[1] || from || "").trim().toLowerCase();
export const imapConfigured = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);
