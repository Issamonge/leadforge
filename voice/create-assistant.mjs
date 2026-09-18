#!/usr/bin/env node
/**
 * create-assistant.mjs — pushes voice/assistant.json to Vapi and prints the assistant id.
 * Requires: VAPI_API_KEY env var. Run once; re-run to update.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const key = process.env.VAPI_API_KEY;
if (!key) { console.error("Set VAPI_API_KEY first."); process.exit(1); }

const pub = process.env.PUBLIC_WEBHOOK_URL || "";
let cfg = JSON.parse(await readFile(resolve(here, "assistant.json"), "utf8"));
if (pub) cfg.serverUrl = `${pub.replace(/\/$/, "")}/api/voice/webhook`;

const res = await fetch("https://api.vapi.ai/assistant", {
  method: "POST",
  headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify(cfg),
});
const out = await res.json();
console.log("HTTP", res.status);
console.log(JSON.stringify(out, null, 2).slice(0, 900));
if (out?.id) console.log("\nASSISTANT_ID=" + out.id);
