#!/usr/bin/env node
/**
 * engine/smtp.mjs — a zero-dependency SMTP client.
 *
 * This is the "build it yourself" sender: no Resend, no Brevo, no API keys.
 * Point it at any SMTP server (Gmail app password, your host, your own MTA).
 *
 * Env:
 *   SMTP_HOST  (default smtp.gmail.com)
 *   SMTP_PORT  (default 465 = implicit TLS; use 587 for STARTTLS)
 *   SMTP_USER  your full email
 *   SMTP_PASS  an app password (NOT your normal password)
 *   SMTP_FROM  "Name <you@example.com>" (defaults to SMTP_USER)
 */
import net from "node:net";
import tls from "node:tls";

function connect({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const sock = secure
      ? tls.connect({ host, port, servername: host }, () => resolve(sock))
      : net.connect({ host, port }, () => resolve(sock));
    sock.setMaxListeners(0); // we add/remove listeners per SMTP step
    sock.setTimeout(30000, () => { sock.destroy(); reject(new Error("SMTP timeout")); });
    sock.once("error", reject);
  });
}

/** Read one (possibly multi-line) SMTP reply. Resolves with the code. */
function reply(sock) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (d) => {
      buf += d.toString("utf8");
      const lines = buf.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;
      const last = lines[lines.length - 1];
      if (!/^\d{3} /.test(last)) return; // keep waiting for the final line
      sock.off("data", onData);
      sock.off("error", onErr);
      const code = Number(last.slice(0, 3));
      code >= 400 ? reject(new Error(`SMTP ${code}: ${last}`)) : resolve(code);
    };
    const onErr = (e) => { sock.off("data", onData); reject(e); };
    sock.on("data", onData);
    sock.once("error", onErr);
  });
}

async function cmd(sock, line, expect) {
  sock.write(line + "\r\n");
  const code = await reply(sock);
  if (expect && !expect.includes(code)) throw new Error(`expected ${expect}, got ${code} for ${line.split(" ")[0]}`);
  return code;
}

const b64 = (s) => Buffer.from(String(s), "utf8").toString("base64");
const dotstuff = (s) => s.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");

/** Send one email. Returns {ok, error?}. */
export async function sendMail({ to, subject, text, from, replyTo }) {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const sender = from || process.env.SMTP_FROM || user;
  if (!user || !pass) return { ok: false, error: "SMTP_USER/SMTP_PASS not set" };

  let sock;
  try {
    sock = await connect({ host, port, secure });
    await reply(sock);                                        // 220 greeting
    await cmd(sock, `EHLO ${host}`, [250]);
    if (!secure) await cmd(sock, "STARTTLS", [220]);
    await cmd(sock, "AUTH LOGIN", [334]);
    await cmd(sock, b64(user), [334]);
    await cmd(sock, b64(pass), [235]);
    await cmd(sock, `MAIL FROM:<${sender.match(/<(.+)>/)?.[1] || sender}>`, [250]);
    await cmd(sock, `RCPT TO:<${to}>`, [250, 251]);
    await cmd(sock, "DATA", [354]);

    const headers = [
      `From: ${sender}`,
      `To: ${to}`,
      replyTo ? `Reply-To: ${replyTo}` : null,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${host}>`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
    ].filter(Boolean).join("\r\n");

    sock.write(headers + "\r\n\r\n" + dotstuff(text) + "\r\n.\r\n");
    await reply(sock);
    await cmd(sock, "QUIT", [221]).catch(() => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { sock?.destroy(); } catch {}
  }
}

export const smtpConfigured = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);
