#!/usr/bin/env node
/**
 * engine/followup.mjs — the single biggest revenue lever.
 *
 * Most replies come from follow-ups 2 and 3, and almost nobody sends them.
 * This tracks every send in data/outreach-log.json and sequences:
 *   step 0  initial pitch
 *   step 1  +3 days  — short bump
 *   step 2  +7 days  — add value (a specific idea for their business)
 *   step 3  +14 days — polite close ("should I close your file?")
 * then stop forever.
 *
 * Reply detection (engine/imap.mjs) stops the sequence the moment they answer.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOG = resolve(ROOT, "data/outreach-log.json");
const DELAYS = [0, 3, 7, 14];          // days after the PREVIOUS step
export const MAX_STEP = 3;

export async function loadLog() { try { return JSON.parse(await readFile(LOG, "utf8")); } catch { return []; } }
export async function saveLog(log) { await mkdir(dirname(LOG), { recursive: true }); await writeFile(LOG, JSON.stringify(log, null, 2), "utf8"); }

const days = (a, b) => (new Date(a) - new Date(b)) / 86400000;

/** Which entries are due for their next follow-up right now? */
export function dueFollowUps(log, now = Date.now()) {
  return log.filter((e) => {
    if (e.repliedAt || e.bouncedAt || e.optedOutAt) return false;   // answered / dead / opted out
    if (e.step >= MAX_STEP) return false;                            // sequence finished
    const ref = e.lastSentAt || e.sentAt;
    return days(now, ref) >= DELAYS[e.step + 1];
  });
}

/** Follow-up content — a different angle each time, never just "did you see my email?" */
export function followUp(step, entry) {
  const biz = String(entry.business || "your team").split(" — ")[0].trim();
  const svc = entry.service || "automation";
  const city = entry.city || "your area";
  if (step === 1) {
    return {
      subject: `Re: ${biz}`,
      body: [
        `Hi ${biz},`,
        ``,
        `Just floating this back to the top of your inbox — the $350 pilot offer stands.`,
        ``,
        `If it's not a priority right now, no problem at all. If it is, reply "yes" and I'll send two times.`,
        ``,
        `— Issa`,
      ].join("\n"),
    };
  }
  if (step === 2) {
    return {
      subject: `${biz}: one specific idea`,
      body: [
        `Hi ${biz},`,
        ``,
        `One concrete thing I noticed — businesses in ${city} in your category usually lose most enquiries in the first hour of silence.`,
        ``,
        `A single ${svc} flow fixes that: instant acknowledgement, then a follow-up at 24h and 72h. It runs on its own after setup.`,
        ``,
        `I build that as a fixed-price $350 pilot in 48-72 hours. Want me to show you what yours would look like?`,
        ``,
        `— Issa`,
      ].join("\n"),
    };
  }
  return {
    subject: `Should I close your file?`,
    body: [
      `Hi ${biz},`,
      ``,
      `I don't want to keep landing in your inbox, so this is my last note.`,
      ``,
      `Two options:`,
      `1. Reply "yes" and I'll send the $350 pilot details.`,
      `2. Reply "no" and I'll remove you entirely — no hard feelings.`,
      ``,
      `Either answer is a good one.`,
      ``,
      `— Issa Hakizimana`,
    ].join("\n"),
  };
}
