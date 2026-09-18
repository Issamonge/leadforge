#!/usr/bin/env node
// Injects the latest data/leads.json into index.template.html -> index.html
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = readFileSync(resolve(root, "data/leads.json"), "utf8");
let html = readFileSync(resolve(root, "index.template.html"), "utf8");
html = html.replace("/*__LEADS_JSON__*/null", data);
writeFileSync(resolve(root, "index.html"), html);
console.log(`index.html rebuilt (${html.length} bytes)`);
