#!/usr/bin/env node
/*
 * Relay LAN de PokéIsaac (versión Node, para pruebas en PC).
 * Mismo protocolo que el servidor Java de la app Android:
 *   cliente -> servidor: [evento, datos, idAck?]   eventos: sub, unsub, b, track, untrack
 *   servidor -> cliente: [evento, datos] | ["__ack", idAck, respuesta]   eventos: p, b
 * Uso: node lan-relay.js [puerto] [carpetaWeb]
 *   Si se da carpetaWeb, también sirve el juego por HTTP en ese puerto.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = +process.argv[2] || 8787;
const WEB = process.argv[3] ? path.resolve(process.argv[3]) : null;
const MAX_PER_ROOM = 12;

const topics = new Map();   // t -> { subs:Set<ws>, pres:Map<key,{ws,meta}> }
const roomOf = t => { const m = /^pokeisaac:room:([A-Z0-9]+)/.exec(t || ""); return m ? m[1] : ""; };
const topic = t => { let x = topics.get(t); if (!x) topics.set(t, x = { subs: new Set(), pres: new Map() }); return x; };

function send(ws, arr) { if (ws.readyState === 1) ws.send(JSON.stringify(arr)); }
function presState(x) { const s = {}; for (const [k, v] of x.pres) s[k] = [v.meta]; return s; }
function pushPresence(t) {
  const x = topics.get(t); if (!x) return;
  const msg = ["p", { t, s: presState(x) }];
  for (const ws of x.subs) send(ws, msg);
}
function gc(t) { const x = topics.get(t); if (x && !x.subs.size && !x.pres.size) topics.delete(t); }

const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg",
  ".json": "application/json", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".ttf": "font/ttf", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"ok":true,"region":"lan"}'); }
  if (!WEB) { res.writeHead(404); return res.end(); }
  let p = decodeURIComponent(u.pathname); if (p.endsWith("/")) p += "index.html";
  const f = path.join(WEB, p);
  if (!f.startsWith(WEB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws, req) => {
  const room = new URL(req.url, "http://x").searchParams.get("room") || "";
  const inRoom = [...wss.clients].filter(c => c.room === room).length;
  ws.room = room; ws.topics = new Set();
  if (inRoom >= MAX_PER_ROOM) { ws.close(); return; }
  ws.on("message", raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const [ev, d, ack] = m; if (!d || typeof d.t !== "string") return;
    if (roomOf(d.t) !== room) return;
    const x = topic(d.t);
    if (ev === "sub") {
      x.subs.add(ws); ws.topics.add(d.t);
      if (ack) send(ws, ["__ack", ack, { ok: true }]);
      send(ws, ["p", { t: d.t, s: presState(x) }]);
    } else if (ev === "unsub") {
      x.subs.delete(ws); ws.topics.delete(d.t);
      let ch = false; for (const [k, v] of x.pres) if (v.ws === ws) { x.pres.delete(k); ch = true; }
      if (ch) pushPresence(d.t); gc(d.t);
    } else if (ev === "b") {
      const msg = JSON.stringify(["b", { t: d.t, e: d.e, p: d.p }]);
      for (const c of x.subs) if (c !== ws && c.readyState === 1) c.send(msg);
    } else if (ev === "track") {
      if (typeof d.k !== "string") return;
      x.pres.set(d.k, { ws, meta: d.m }); pushPresence(d.t);
    } else if (ev === "untrack") {
      const v = x.pres.get(d.k); if (v && v.ws === ws) { x.pres.delete(d.k); pushPresence(d.t); }
    }
  });
  ws.on("close", () => {
    for (const t of ws.topics) {
      const x = topics.get(t); if (!x) continue;
      x.subs.delete(ws);
      let ch = false; for (const [k, v] of x.pres) if (v.ws === ws) { x.pres.delete(k); ch = true; }
      if (ch) pushPresence(t); gc(t);
    }
  });
});

server.listen(PORT, () => console.log(`Relay LAN en :${PORT}${WEB ? " sirviendo " + WEB : ""}`));
