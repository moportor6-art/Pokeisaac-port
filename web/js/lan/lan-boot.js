/*
 * PokéIsaac Android — modo offline + cooperativo por wifi (LAN).
 *
 * Se carga ANTES de pokeisaac.js. Hace tres cosas:
 *  1. Configura el juego para que use sus archivos locales (sin CDN ni Supabase).
 *  2. Apunta el "servidor propio" de cooperativo (Relay) a una dirección ficticia
 *     y responde su /health aquí mismo.
 *  3. Define window.io: un sustituto mínimo de socket.io que habla con el relay LAN.
 *     - En la app Android el tráfico va por el puente nativo (PiAndroid.lan*): el
 *       teléfono anfitrión levanta un servidor en la red wifi y lo anuncia por UDP.
 *     - En un navegador de PC (pruebas) se conecta por WebSocket a ws://<host>:8787.
 */
(function () {
  "use strict";

  var COOP_URL = "https://lan.pokeisaac.invalid";
  var BRIDGE = window.PiAndroid && typeof window.PiAndroid.lanConnect === "function" ? window.PiAndroid : null;

  // --- 1. Offline -----------------------------------------------------------
  // Archivos locales (assets/<dir>/...) leídos desde los paquetes .pack igual que en la web.
  window.PI_ASSETS = { base: "assets/", ver: "", vers: {}, bases: {}, mirror: null, packv: "local", packsOnBase: true };
  window.PI_COOP_URL = COOP_URL;      // Relay "configurado"
  window.PI_COOP_REGIONS = null;      // una sola "región": la wifi
  window.PI_ICE = [];                 // WebRTC solo con candidatos locales (sin STUN)
  window.PI_LAN = { bridge: !!BRIDGE };

  // --- 2. /health del relay -------------------------------------------------
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  if (realFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (url.indexOf(COOP_URL) === 0) {
        var body = /\/health/.test(url) ? { ok: true, region: "lan" } : { ok: false, error: "off" };
        return Promise.resolve(new Response(JSON.stringify(body), {
          status: 200, headers: { "Content-Type": "application/json" }
        }));
      }
      return realFetch(input, init);
    };
  }

  // --- 3. Transporte --------------------------------------------------------
  // Cada transporte expone: open(room, cbs{open,msg,close,error}) -> {send(str), close()}

  var bridgeConns = {};
  window.__piLanEvent = function (id, kind, data) {
    var c = bridgeConns[id];
    if (!c) return;
    try {
      if (kind === "open") c.open();
      else if (kind === "msg") c.msg(data);
      else if (kind === "close") { delete bridgeConns[id]; c.close(data); }
      else if (kind === "error") c.error(data);
    } catch (e) { console.warn("[lan]", e); }
  };

  function bridgeTransport(room, cbs) {
    var id = String(BRIDGE.lanConnect(room));
    if (!id || id === "-1") { setTimeout(function () { cbs.error("lan"); cbs.close("lan"); }, 0); return { send: function () {}, close: function () {} }; }
    bridgeConns[id] = cbs;
    return {
      send: function (s) { BRIDGE.lanSend(id, s); },
      close: function () { delete bridgeConns[id]; BRIDGE.lanClose(id); }
    };
  }

  function wsTransport(room, cbs) {
    var q = new URLSearchParams(location.search);
    var host = q.get("lanhost") || location.hostname || "127.0.0.1";
    var port = q.get("lanport") || "8787";
    var ws;
    try { ws = new WebSocket("ws://" + host + ":" + port + "/?room=" + encodeURIComponent(room)); }
    catch (e) { setTimeout(function () { cbs.error(e); cbs.close("err"); }, 0); return { send: function () {}, close: function () {} }; }
    ws.onopen = function () { cbs.open(); };
    ws.onmessage = function (ev) { cbs.msg(ev.data); };
    ws.onerror = function () { cbs.error("ws"); };
    ws.onclose = function () { cbs.close("ws"); };
    return {
      send: function (s) { if (ws.readyState === 1) ws.send(s); },
      close: function () { try { ws.close(); } catch (e) {} }
    };
  }

  var openTransport = BRIDGE ? bridgeTransport : wsTransport;

  // --- Sustituto de socket.io -------------------------------------------------
  // Mensajes: [evento, datos, idAck?]  |  ["__ack", idAck, respuesta]
  function Socket(url, opts) {
    this.opts = opts || {};
    this.room = (this.opts.query && this.opts.query.room) || "";
    this.handlers = {};
    this.acks = {};
    this.buf = [];
    this.ackSeq = 0;
    this.connected = false;
    this.manual = false;
    this.tries = 0;
    this.t = null;
    this.timer = 0;
    var self = this;
    this.volatile = { emit: function (ev, data) { if (self.connected) self._send([ev, data]); return self; } };
    this.connect();
  }
  Socket.prototype.on = function (ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; };
  Socket.prototype.off = function (ev, fn) {
    if (!fn) delete this.handlers[ev];
    else if (this.handlers[ev]) this.handlers[ev] = this.handlers[ev].filter(function (f) { return f !== fn; });
    return this;
  };
  Socket.prototype.removeAllListeners = function () { this.handlers = {}; return this; };
  Socket.prototype._fire = function (ev, a, b) {
    var hs = (this.handlers[ev] || []).slice();
    for (var i = 0; i < hs.length; i++) { try { hs[i](a, b); } catch (e) { console.warn("[lan]", e); } }
  };
  Socket.prototype._send = function (arr) { if (this.t) this.t.send(JSON.stringify(arr)); };
  Socket.prototype.emit = function (ev, data, ack) {
    var arr = [ev, data];
    if (typeof ack === "function") { var id = ++this.ackSeq; this.acks[id] = ack; arr.push(id); }
    // Como socket.io: lo emitido sin conexión se guarda y se manda al conectar.
    if (!this.connected) { if (this.buf.length < 500) this.buf.push(arr); return this; }
    this._send(arr);
    return this;
  };
  Socket.prototype.connect = function () {
    var self = this;
    this.manual = false;
    clearTimeout(this.timer);
    if (this.t) { try { this.t.close(); } catch (e) {} }
    var opened = false;
    this.t = openTransport(this.room, {
      open: function () {
        opened = true; self.tries = 0; self.connected = true;
        var b = self.buf; self.buf = [];
        for (var i = 0; i < b.length; i++) self._send(b[i]);
        self._fire("connect");
      },
      msg: function (s) {
        var m; try { m = JSON.parse(s); } catch (e) { return; }
        if (!m || !m.length) return;
        if (m[0] === "__ack") { var f = self.acks[m[1]]; delete self.acks[m[1]]; if (f) try { f(m[2]); } catch (e) {} return; }
        self._fire(m[0], m[1]);
      },
      error: function () { if (!opened) self._fire("connect_error", new Error("lan")); },
      close: function () {
        var was = self.connected;
        self.connected = false; self.t = null;
        if (was) self._fire("disconnect", "transport close");
        if (!self.manual && self.opts.reconnection !== false) {
          self.tries++;
          var d = Math.min(self.opts.reconnectionDelayMax || 2000, (self.opts.reconnectionDelay || 300) * self.tries);
          self.timer = setTimeout(function () { if (!self.manual) self.connect(); }, d);
        }
      }
    });
    return this;
  };
  Socket.prototype.disconnect = function () {
    this.manual = true;
    this.buf = [];
    clearTimeout(this.timer);
    var was = this.connected;
    this.connected = false;
    if (this.t) { try { this.t.close(); } catch (e) {} this.t = null; }
    if (was) this._fire("disconnect", "io client disconnect");
    return this;
  };
  Socket.prototype.close = Socket.prototype.disconnect;

  window.io = function (url, opts) {
    var sk = new Socket(url, opts);
    window.PI_LAN.room = sk.room;
    return sk;
  };

  // --- Lista de salas en la wifi (pantalla de cooperativo) -------------------
  function lanRooms() {
    try { return BRIDGE && BRIDGE.lanRooms ? JSON.parse(BRIDGE.lanRooms()) || [] : []; } catch (e) { return []; }
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function paintRooms() {
    var ui = document.getElementById("coop-ui");
    if (!ui || ui.hidden) return;
    // Dentro de una sala: mostrar el código para que los demás puedan escribirlo.
    var top = ui.querySelector(".cp-top");
    if (top && window.PI_LAN.room && !top.querySelector(".lan-code")) {
      var chip = document.createElement("span");
      chip.className = "cp-chip lan-code";
      chip.textContent = "CÓDIGO " + window.PI_LAN.room;
      top.insertBefore(chip, top.firstChild);
    }
    var join = ui.querySelector(".coop-join");
    if (!join) return;
    var box = ui.querySelector(".lan-rooms");
    if (!box) {
      box = document.createElement("div");
      box.className = "lan-rooms";
      join.parentNode.insertBefore(box, join.nextSibling);
      box.addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-lan]");
        if (!b) return;
        ev.preventDefault(); ev.stopPropagation();
        var inp = ui.querySelector("#coop-code");
        var btn = ui.querySelector('[data-act="join"]');
        if (inp && btn) { inp.value = b.getAttribute("data-lan"); btn.click(); }
      });
    }
    var rooms = lanRooms();
    var html = '<div class="lan-title">Salas en tu wifi</div>';
    if (!BRIDGE) html += '<div class="lan-empty">Solo disponible en la app de Android.</div>';
    else if (!rooms.length) html += '<div class="lan-empty">Buscando salas… El anfitrión debe pulsar «Entrar» y estar en la misma wifi.</div>';
    else rooms.forEach(function (r) {
      html += '<button type="button" class="lan-room" data-lan="' + esc(r.code) + '"><b>' + esc(r.code) + "</b> · " +
        esc(r.name || "Sala") + " · " + esc(r.players || 1) + "/4</button>";
    });
    if (box.__h !== html) { box.innerHTML = html; box.__h = html; }
  }

  function startRoomsWatcher() {
    var ui = document.getElementById("coop-ui");
    if (!ui) return;
    new MutationObserver(function () { paintRooms(); }).observe(ui, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    setInterval(paintRooms, 1500);
    var st = document.createElement("style");
    st.textContent =
      ".lan-rooms{margin:10px 0 4px;padding:8px;border:2px dashed #3a3450;border-radius:8px}" +
      ".lan-title{font-size:11px;color:#ffd23c;margin-bottom:6px}" +
      ".lan-empty{font-size:10px;color:#a9a3c0;line-height:1.5}" +
      ".lan-room{display:block;width:100%;margin:4px 0;padding:8px;border:2px solid #3a3450;border-radius:6px;background:#2a2440;color:#dfe2f0;font:inherit;font-size:11px;text-align:left;cursor:pointer}" +
      ".lan-room b{color:#7ee787}" +
      ".lan-code{color:#ffd23c!important;border-color:#ffd23c!important;letter-spacing:2px}";
    document.head.appendChild(st);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startRoomsWatcher);
  else startRoomsWatcher();
})();
