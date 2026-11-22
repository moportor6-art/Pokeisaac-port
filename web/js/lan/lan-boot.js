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

  // Cuenta local: el juego trae su propio servidor simulado (tools/patch_game.py lo activa con PI_LOCAL_DB).
  // Todo lo que en la web vive en el servidor (Gacha, misiones, tienda, huevos, eventos…) se guarda aquí,
  // en el teléfono. La primera vez se entra como invitado, sin pedir correo ni contraseña.
  window.PI_LOCAL_DB = true;
  (function () {
    var DB = "pokeisaac.mock.db", SES = "pokeisaac.mock.session";
    try {
      var db = JSON.parse(localStorage.getItem(DB) || "null") || { users: [], profiles: {}, runs: [], seq: 1 };
      var ses = JSON.parse(localStorage.getItem(SES) || "null");
      if (!ses || !db.users.some(function (u) { return u.id === ses.id; })) {
        var u = db.users[0];
        if (!u) {
          var id = crypto.randomUUID ? crypto.randomUUID() : "local-" + Date.now().toString(16) + "-" + Math.random().toString(16).slice(2);
          u = { id: id, email: "", confirmed: true, is_anonymous: true, meta: { app: "pokeisaac" } };
          db.users.push(u);
          localStorage.setItem(DB, JSON.stringify(db));
        }
        localStorage.setItem(SES, JSON.stringify({ id: u.id }));
      }
    } catch (e) { console.warn("[local-db]", e); }
  })();
  (function () {
    try {   // primera vez en la app: apuntado AUTO TOTAL en táctil (se cambia en Opciones → Táctil)
      if (!localStorage.getItem("pokeisaac.port.aim")) {
        var st = JSON.parse(localStorage.getItem("pokeisaac.settings.v1") || "{}");
        if (!st.touchAim || st.touchAim === "stick") st.touchAim = "autofull";
        localStorage.setItem("pokeisaac.settings.v1", JSON.stringify(st));
        localStorage.setItem("pokeisaac.port.aim", "1");
      }
    } catch (e) {}
    var css = document.createElement("style");
    // Sin servidor: fuera los botones para entrar con Google/Discord/el navegador.
    // Sin cuentas: en «Mi cuenta» solo quedan el avatar y el nombre de entrenador
    css.textContent = ".acc-mock,.ap-mock,.au-web,.au-google,.au-discord," +
      "#account-ui .ap-secpn,#account-ui .ap-dcpn,#account-ui .ap-sespn,#account-ui .ap-chip.is-guest,#account-ui .ap-mail{display:none!important}";
    (document.head || document.documentElement).appendChild(css);
    try { localStorage.setItem("pokeisaac.kofipromo.off", "1"); } catch (e) {}
    // Todo local: ningún enlace saca del juego (Discord, Ko-fi, web…)
    window.open = function () { return null; };
    document.addEventListener("click", function (ev) {
      var a = ev.target && ev.target.closest && ev.target.closest("a[href]");
      if (a && /^(https?:|mailto:)/i.test(a.getAttribute("href") || "") && a.host !== location.host) { ev.preventDefault(); ev.stopPropagation(); }
    }, true);
    // «Mi cuenta»: fuera la fila «Nube: sincronizado»
    function sinNube() {
      var ui = document.getElementById("account-ui");
      if (!ui) return;
      var dts = ui.querySelectorAll("dt");
      for (var i = 0; i < dts.length; i++) {
        if (/^(nube|cloud|nuage)$/i.test(dts[i].textContent.trim())) {
          var dd = dts[i].nextElementSibling;
          dts[i].style.display = "none";
          if (dd && dd.tagName === "DD") dd.style.display = "none";
        }
      }
    }
    new MutationObserver(sinNube).observe(document.documentElement, { childList: true, subtree: true });
  })();

  // --- Opciones → Datos → App Android (filas que añade tools/patch_game.py) ---
  var GAME = null;
  // Textos del port en el idioma del juego (español; inglés para el resto)
  function lang() {
    try { if (GAME && GAME.I18n && GAME.I18n.lang) return GAME.I18n.lang; } catch (e) {}
    try { var l = JSON.parse(localStorage.getItem("pokeisaac.settings.v1") || "{}").lang; if (l && l !== "auto") return l; } catch (e) {}
    return (navigator.language || "es").slice(0, 2);
  }
  function L(es, en) { return lang() === "es" ? es : en; }
  function ask(o) { return GAME && GAME.Confirm ? GAME.Confirm.ask(o) : Promise.resolve(window.confirm(o.title + "\n\n" + o.body.join("\n"))); }
  window.PI_PORT = {
    action: function (id, g) {
      GAME = g || GAME;
      if (id === "portUpdate") {
        if (BRIDGE && BRIDGE.updCheck) BRIDGE.updCheck();
        else ask({ title: L("Actualizaciones", "Updates"), body: [L("Solo en la app de Android.", "Only in the Android app.")], yes: "OK" });
      } else if (id === "portHistory") {
        if (BRIDGE && BRIDGE.updHistory) BRIDGE.updHistory();
      } else if (id === "portReset") {
        ask({ title: L("Volver a la versión de la APK", "Back to the APK version"),
              body: [L("Se borran las actualizaciones descargadas y el juego vuelve a la versión que trae la APK. Tus partidas no se tocan.",
                       "Downloaded updates are removed and the game goes back to the version inside the APK. Your saves are kept.")],
              yes: L("Volver", "Revert"), no: L("Cancelar", "Cancel"), danger: true })
          .then(function (ok) { if (ok && BRIDGE && BRIDGE.updReset) BRIDGE.updReset(); });
      }
    }
  };
  // Respuesta del historial (Updater.history)
  window.fusionUpdHistory = function (json) {
    var list = [];
    try { list = JSON.parse(json) || []; } catch (e) {}
    var body = list.length ? list.slice(0, 8).map(function (r) {
      var nota = String(r.notes || "").split("\n")[0];
      return r.version + " · " + String(r.date || "").slice(0, 10) + (nota ? " — " + nota : "");
    }) : [L("No se pudo cargar el historial (¿sin internet?).", "Could not load the history (no internet?).")];
    ask({ title: L("Versiones de PokéIsaac Android", "PokéIsaac Android versions"), body: body, yes: "OK" });
  };

  // El juego cargó: el actualizador de la app ya no tiene que volver a la versión anterior
  window.addEventListener("load", function () {
    setTimeout(function () { try { BRIDGE && BRIDGE.updBooted && BRIDGE.updBooted(); } catch (e) {} }, 3000);
  });

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
