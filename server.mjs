#!/usr/bin/env node
/**
 * Lead Machine — zero-login dashboard server.
 * Serves the dashboard, the live lead data, and lets you trigger the engine
 * on demand. Pair with `cloudflared tunnel --url http://localhost:PORT`
 * for a public HTTPS URL with no account and no login.
 */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleVoiceEvent } from "./voice/webhook.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);

const MIME = { ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

let running = false;

function runEngine() {
  return new Promise((resolveRun) => {
    if (running) return resolveRun({ ok: false, error: "Engine already running" });
    running = true;
    const child = spawn(process.execPath, [resolve(ROOT, "engine/run.mjs")], { cwd: ROOT, env: { ...process.env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", async (code) => {
      try {
        await new Promise((r, j) =>
          spawn(process.execPath, [resolve(ROOT, "engine/build-dashboard.mjs")], { cwd: ROOT })
            .on("close", (c) => (c === 0 ? r() : j(new Error("build failed"))))
        );
      } catch (e) { /* non-fatal */ }
      running = false;
      resolveRun({ ok: code === 0, log: out.trim().split("\n").slice(-8) });
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/run" && req.method === "POST") {
    const result = await runEngine();
    res.writeHead(result.ok ? 200 : 500, { "content-type": "application/json" });
    return res.end(JSON.stringify(result));
  }
  if (url.pathname === "/api/voice/webhook" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let payload = {};
    try { payload = JSON.parse(raw || "{}"); } catch { payload = {}; }
    try {
      const result = await handleVoiceEvent(payload);
      console.log(`[voice] action=${result.action} sent=${result.sent} caller=${result.caller}`);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }
  if (url.pathname === "/api/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, running, time: new Date().toISOString() }));
  }

  let path = url.pathname === "/" ? "/index.html" : url.pathname;
  try {
    const buf = await readFile(resolve(ROOT, "." + path));
    res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
    return res.end(buf);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("Not found");
  }
});

server.listen(PORT, () => console.log(`Lead Machine dashboard on http://localhost:${PORT}`));
