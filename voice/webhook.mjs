#!/usr/bin/env node
/**
 * voice/webhook.mjs — receives call events from a voice-AI provider (Vapi / Retell /
 * Bland) and escalates to YOUR WhatsApp the moment a human is needed.
 *
 * This is the half that works right now: provider-agnostic ingestion + WhatsApp alert.
 * The voice conversation itself requires a provider account + API key.
 */
import { alertWhatsApp } from "../engine/notify.mjs";

const fmt = (s, n = 400) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

/** Decide whether a finished/ongoing call needs the human. */
export function classify(payload) {
  const m = payload?.message || payload || {};
  const type = m.type || m.event || "unknown";
  const call = m.call || m.call_data || {};
  const transcript = m.transcript || call.transcript || "";
  const summary = m.summary || m.analysis?.summary || "";
  const endedReason = m.endedReason || m.ended_reason || call.endedReason || "";
  const caller = call.customer?.number || m.from || m.caller || "unknown";
  const text = `${summary} ${transcript}`.toLowerCase();

  const wantsHuman = /human|agent|manager|real person|speak to someone|representative/.test(text);
  const notInterested = /not interested|no thanks|no thank you|remove me|stop calling|don'?t call/.test(text);
  const interested = /interested|sounds good|how much|send me|yes|let'?s do|quote|proposal|payment|invoice/.test(text);
  const wantsPayment = /pay|payment|invoice|link|checkout|buy now/.test(text);

  let action = "log";
  if (wantsHuman) action = "escalate_human";
  else if (notInterested) action = "not_interested";
  else if (interested || wantsPayment) action = "hot";

  return { type, caller, summary: fmt(summary), transcript: fmt(transcript, 1200), endedReason, action, wantsPayment };
}

function buildMessage(c) {
  const head = `*Lead Machine — CALL ALERT*`;
  const emoji = { escalate_human: "🔴 ESCALATION", not_interested: "🟡 NOT INTERESTED", hot: "🟢 INTERESTED", log: "⚪ Logged" }[c.action];
  return [
    head,
    `${emoji}`,
    ``,
    `Caller: ${c.caller}`,
    c.endedReason ? `Ended: ${c.endedReason}` : null,
    c.summary ? `\nSummary: ${c.summary}` : null,
    c.transcript ? `\nTranscript: ${c.transcript}` : null,
    ``,
    c.action === "escalate_human" ? `👉 Call them back now to close.` : null,
    c.action === "not_interested" ? `👉 Wants a human? Follow up personally.` : null,
    c.action === "hot" ? `👉 Send the payment link and close.` : null,
  ].filter(Boolean).join("\n");
}

/** Handle an incoming provider webhook. Returns {ok, action, sent}. */
export async function handleVoiceEvent(payload) {
  const c = classify(payload);
  const interesting = ["escalate_human", "not_interested", "hot"].includes(c.action);
  let sent = false;
  if (interesting) {
    const r = await alertWhatsApp(buildMessage(c), { kind: "voice_" + c.action, caller: c.caller });
    sent = !!r.sent;
  }
  return { ok: true, action: c.action, sent, caller: c.caller };
}
