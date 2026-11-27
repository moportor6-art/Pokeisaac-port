var WorldGen = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.js
  var index_exports = {};
  __export(index_exports, {
    adapters: () => adapters,
    biomas: () => biomas,
    core: () => core,
    version: () => version
  });

  // src/rng.js
  function hashSeed(seed) {
    if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
    const s = String(seed);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function createRng(seed) {
    let a = hashSeed(seed) || 1;
    const next = () => {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    const rng = {
      next,
      /** Decimal en [a, b). */
      range: (lo, hi) => lo + next() * (hi - lo),
      /** Entero en [a, b]. */
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      chance: (p) => next() < p,
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      /** Elige por peso: [{peso, ...}] o pares [valor, peso]. */
      weighted(items, key = "peso") {
        const w = items.map((it) => {
          var _a;
          return Array.isArray(it) ? it[1] : (_a = it[key]) != null ? _a : 1;
        });
        let r = next() * w.reduce((s, x) => s + x, 0);
        for (let i = 0; i < items.length; i++) if ((r -= w[i]) < 0) return Array.isArray(items[i]) ? items[i][0] : items[i];
        return Array.isArray(items.at(-1)) ? items.at(-1)[0] : items.at(-1);
      },
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      },
      /** Sub-generador independiente (para que añadir una capa no cambie las demás). */
      fork: (tag) => createRng(hashSeed(`${seed}|${tag}`))
    };
    return rng;
  }

  // src/noise.js
  var GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  var F2 = 0.5 * (Math.sqrt(3) - 1);
  var G2 = (3 - Math.sqrt(3)) / 6;
  function createNoise(seed) {
    const rng = createRng(seed);
    const p = rng.shuffle(Array.from({ length: 256 }, (_, i) => i));
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    function simplex(x, y) {
      const s = (x + y) * F2;
      const i = Math.floor(x + s), j = Math.floor(y + s);
      const t = (i + j) * G2;
      const x0 = x - (i - t), y0 = y - (j - t);
      const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let n = 0;
      const corner = (gx, gy, dx, dy) => {
        const tt = 0.5 - dx * dx - dy * dy;
        if (tt < 0) return 0;
        const g = GRAD[perm[gx + perm[gy]] & 7];
        return tt ** 4 * (g[0] * dx + g[1] * dy);
      };
      n += corner(ii, jj, x0, y0);
      n += corner(ii + i1, jj + j1, x1, y1);
      n += corner(ii + 1, jj + 1, x2, y2);
      return 70 * n;
    }
    function fbm(x, y, { octaves = 4, lacunarity = 2, gain = 0.5 } = {}) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let o = 0; o < octaves; o++) {
        sum += amp * simplex(x * freq, y * freq);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
      }
      return sum / norm;
    }
    return { simplex, fbm };
  }

  // src/geom.js
  var geom_exports = {};
  __export(geom_exports, {
    capsuleHit: () => capsuleHit,
    chaikin: () => chaikin,
    distToPolyEdge: () => distToPolyEdge,
    distToSegment: () => distToSegment,
    pointInPoly: () => pointInPoly,
    polyArea: () => polyArea,
    polyBounds: () => polyBounds,
    roundPoly: () => roundPoly
  });
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function distToPolyEdge(x, y, poly) {
    let d = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      d = Math.min(d, distToSegment(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
    }
    return d;
  }
  var capsuleHit = (c, x, y, extra = 0) => distToSegment(x, y, c.ax, c.ay, c.bx, c.by) < c.r + extra;
  function chaikin(poly, iterations = 1) {
    let p = poly;
    for (let k = 0; k < iterations; k++) {
      const out = [];
      for (let i = 0; i < p.length; i++) {
        const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
        out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
      }
      p = out;
    }
    return p;
  }
  function polyArea(poly) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
    return Math.abs(a / 2);
  }
  function polyBounds(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of poly) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return { x0, y0, x1, y1 };
  }
  var roundPoly = (poly) => poly.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);

  // src/shapes.js
  var shapes_exports = {};
  __export(shapes_exports, {
    island: () => island,
    roomGrid: () => roomGrid,
    tileGrid: () => tileGrid
  });
  function island(seed, { cx = 0, cy = 0, rx, ry, rugosidad = 0.35, detalle = 1.6, puntos = 72, suavizado = 1, minRadio = 0.45 }) {
    const { fbm } = createNoise(seed);
    const poly = [];
    for (let i = 0; i < puntos; i++) {
      const a = i / puntos * Math.PI * 2;
      const n = fbm(Math.cos(a) * detalle + 7.3, Math.sin(a) * detalle - 3.1, { octaves: 4 });
      const k = Math.max(minRadio, Math.min(1, 1 - rugosidad * 0.5 + n * rugosidad));
      poly.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return chaikin(poly, suavizado);
  }
  function tileGrid(seed, { w, h, escala = 0.08, pared = 0.45, liquido = -0.5, borde = true }) {
    const { fbm } = createNoise(seed);
    const tiles = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = fbm(x * escala, y * escala, { octaves: 4 });
        let t = v > pared ? 1 : v < liquido ? 2 : 0;
        if (borde && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) t = 1;
        tiles[y * w + x] = t;
      }
    }
    return { w, h, tiles, at: (x, y) => x < 0 || y < 0 || x >= w || y >= h ? 1 : tiles[y * w + x] };
  }
  function roomGrid(rng, { salas = 10, ancho = 9, alto = 8, especiales = ["tesoro", "tienda"] } = {}) {
    const key = (x, y) => `${x},${y}`;
    const DIRS = [["n", 0, -1, "s"], ["s", 0, 1, "n"], ["e", 1, 0, "o"], ["o", -1, 0, "e"]];
    const sx = Math.floor(ancho / 2), sy = Math.floor(alto / 2);
    const map = /* @__PURE__ */ new Map([[key(sx, sy), { x: sx, y: sy, tipo: "inicio", dist: 0 }]]);
    const vecinos = (x, y) => DIRS.filter(([, dx, dy]) => map.has(key(x + dx, y + dy))).length;
    let intentos = 0;
    while (map.size < salas && intentos++ < 5e3) {
      const base = rng.pick([...map.values()]);
      const [, dx, dy] = rng.pick(DIRS);
      const nx = base.x + dx, ny = base.y + dy;
      if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto || map.has(key(nx, ny))) continue;
      if (vecinos(nx, ny) > 1) continue;
      map.set(key(nx, ny), { x: nx, y: ny, tipo: "normal", dist: base.dist + 1 });
    }
    const lista = [...map.values()];
    for (const s of lista) {
      s.puertas = {};
      for (const [d, dx, dy] of DIRS) s.puertas[d] = map.has(key(s.x + dx, s.y + dy));
    }
    const callejones = lista.filter((s) => s.tipo !== "inicio" && Object.values(s.puertas).filter(Boolean).length === 1).sort((a, b) => b.dist - a.dist);
    const jefe = callejones[0] || lista.reduce((a, b) => b.dist > a.dist ? b : a);
    jefe.tipo = "jefe";
    for (const tipo of especiales) {
      const libre2 = callejones.find((s) => s.tipo === "normal");
      if (libre2) libre2.tipo = tipo;
    }
    return { salas: lista, inicio: map.get(key(sx, sy)), jefe };
  }

  // src/place.js
  function poissonDisk(rng, bounds, minDist, accept = () => true, { max = Infinity, k = 20 } = {}) {
    const cell = minDist / Math.SQRT2;
    const gw = Math.ceil((bounds.x1 - bounds.x0) / cell), gh = Math.ceil((bounds.y1 - bounds.y0) / cell);
    const grid = new Int32Array(gw * gh).fill(-1);
    const pts = [], active = [];
    const gi = (x, y) => Math.floor((y - bounds.y0) / cell) * gw + Math.floor((x - bounds.x0) / cell);
    const fits = (x, y) => {
      if (x < bounds.x0 || y < bounds.y0 || x >= bounds.x1 || y >= bounds.y1 || !accept(x, y)) return false;
      const cx = Math.floor((x - bounds.x0) / cell), cy = Math.floor((y - bounds.y0) / cell);
      for (let yy = Math.max(0, cy - 2); yy <= Math.min(gh - 1, cy + 2); yy++) {
        for (let xx = Math.max(0, cx - 2); xx <= Math.min(gw - 1, cx + 2); xx++) {
          const j = grid[yy * gw + xx];
          if (j >= 0 && Math.hypot(pts[j][0] - x, pts[j][1] - y) < minDist) return false;
        }
      }
      return true;
    };
    const add = (x, y) => {
      grid[gi(x, y)] = pts.length;
      active.push(pts.length);
      pts.push([x, y]);
    };
    for (let t = 0; t < 200 && !pts.length; t++) {
      const x = rng.range(bounds.x0, bounds.x1), y = rng.range(bounds.y0, bounds.y1);
      if (fits(x, y)) add(x, y);
    }
    while (active.length && pts.length < max) {
      const ai = Math.floor(rng.next() * active.length);
      const [px, py] = pts[active[ai]];
      let found = false;
      for (let t = 0; t < k; t++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(minDist, 2 * minDist);
        const x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
        if (fits(x, y)) {
          add(x, y);
          found = true;
          break;
        }
      }
      if (!found) active.splice(ai, 1);
    }
    return pts;
  }

  // src/validate.js
  var validate_exports = {};
  __export(validate_exports, {
    checkReachable: () => checkReachable,
    checkTiles: () => checkTiles,
    firstValid: () => firstValid
  });
  function checkReachable({ bounds, celda = 16, walkable, spawn, minRatio = 0.97, minArea = 0 }) {
    const gw = Math.ceil((bounds.x1 - bounds.x0) / celda), gh = Math.ceil((bounds.y1 - bounds.y0) / celda);
    const walk = new Uint8Array(gw * gh);
    let caminable = 0;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (walkable(bounds.x0 + (x + 0.5) * celda, bounds.y0 + (y + 0.5) * celda)) {
          walk[y * gw + x] = 1;
          caminable++;
        }
      }
    }
    const sx = Math.floor((spawn[0] - bounds.x0) / celda), sy = Math.floor((spawn[1] - bounds.y0) / celda);
    if (sx < 0 || sy < 0 || sx >= gw || sy >= gh || !walk[sy * gw + sx]) {
      return { ok: false, motivo: "spawn bloqueado", alcanzable: 0, caminable, ratio: 0, area: 0 };
    }
    const alcanzable = flood(walk, gw, gh, sx, sy);
    const ratio = alcanzable / caminable;
    const area = alcanzable * celda * celda;
    const ok = ratio >= minRatio && area >= minArea;
    const motivo = ok ? "" : ratio < minRatio ? `zonas cerradas (${(100 * (1 - ratio)).toFixed(1)} % sin acceso)` : "\xE1rea demasiado chica";
    return { ok, motivo, alcanzable, caminable, ratio, area };
  }
  function checkTiles(grid, spawn, { minRatio = 0.97, pasa = (t) => t === 0 } = {}) {
    const walk = new Uint8Array(grid.w * grid.h);
    let caminable = 0;
    for (let i = 0; i < walk.length; i++) if (pasa(grid.tiles[i])) {
      walk[i] = 1;
      caminable++;
    }
    if (!walk[spawn[1] * grid.w + spawn[0]]) return { ok: false, motivo: "spawn bloqueado", ratio: 0 };
    const ratio = flood(walk, grid.w, grid.h, spawn[0], spawn[1]) / caminable;
    return { ok: ratio >= minRatio, motivo: ratio >= minRatio ? "" : "zonas cerradas", ratio };
  }
  function flood(walk, gw, gh, sx, sy) {
    const seen = new Uint8Array(gw * gh);
    const stack = [sy * gw + sx];
    seen[stack[0]] = 1;
    let n = 0;
    while (stack.length) {
      const i = stack.pop();
      n++;
      const x = i % gw, y = i / gw | 0;
      if (x > 0 && walk[i - 1] && !seen[i - 1]) {
        seen[i - 1] = 1;
        stack.push(i - 1);
      }
      if (x < gw - 1 && walk[i + 1] && !seen[i + 1]) {
        seen[i + 1] = 1;
        stack.push(i + 1);
      }
      if (y > 0 && walk[i - gw] && !seen[i - gw]) {
        seen[i - gw] = 1;
        stack.push(i - gw);
      }
      if (y < gh - 1 && walk[i + gw] && !seen[i + gw]) {
        seen[i + gw] = 1;
        stack.push(i + gw);
      }
    }
    return n;
  }
  function firstValid(seed, gen, maxIntentos = 30) {
    let ultimo;
    for (let k = 0; k < maxIntentos; k++) {
      const s = k === 0 ? seed : `${seed}#${k}`;
      ultimo = gen(s);
      if (ultimo.check.ok) return { ...ultimo, semillaReal: s, intentos: k + 1 };
    }
    return { ...ultimo, semillaReal: null, intentos: maxIntentos };
  }

  // src/analisis.js
  var analisis_exports = {};
  __export(analisis_exports, {
    buscarBolsillos: () => buscarBolsillos,
    distancias: () => distancias
  });
  function distancias(w, h, pasa, inicios) {
    const d = new Int32Array(w * h).fill(-1);
    const cola = new Int32Array(w * h);
    let a = 0, b = 0;
    for (const i of inicios) if (i >= 0 && i < w * h && pasa(i) && d[i] < 0) {
      d[i] = 0;
      cola[b++] = i;
    }
    while (a < b) {
      const i = cola[a++], x = i % w;
      const v = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const j of v) {
        if (j < 0 || j >= w * h || d[j] >= 0 || !pasa(j)) continue;
        d[j] = d[i] + 1;
        cola[b++] = j;
      }
    }
    return d;
  }
  function buscarBolsillos({ w, h, pasa, tapable = pasa, inicios, importantes = [], min = 12, max = 90, anchoMax = 3 }) {
    const base = distancias(w, h, pasa, inicios);
    const imp = new Set(importantes);
    const vistos = /* @__PURE__ */ new Set();
    const res = [];
    const probar = (puerta) => {
      const clave = puerta.join(",");
      if (vistos.has(clave)) return;
      vistos.add(clave);
      for (const p of puerta) for (const m of imp) if (Math.abs(p % w - m % w) + Math.abs((p / w | 0) - (m / w | 0)) <= 1) return;
      const tapon = new Set(puerta);
      const d = distancias(w, h, (i) => !tapon.has(i) && pasa(i), inicios);
      const celdas = [];
      for (let i = 0; i < w * h; i++) {
        if (base[i] >= 0 && d[i] < 0 && !tapon.has(i)) {
          celdas.push(i);
          if (celdas.length > max) return;
        }
      }
      if (celdas.length < min || celdas.some((i) => imp.has(i))) return;
      const toca = celdas.some((i) => puerta.some((p) => Math.abs(p % w - i % w) + Math.abs((p / w | 0) - (i / w | 0)) === 1));
      if (!toca) return;
      let suma = 0;
      for (const i of celdas) suma += base[i];
      const cx = celdas.reduce((s, i) => s + i % w, 0) / celdas.length, cy = celdas.reduce((s, i) => s + (i / w | 0), 0) / celdas.length;
      const centro = celdas.reduce((m, i) => Math.hypot(i % w - cx, (i / w | 0) - cy) < Math.hypot(m % w - cx, (m / w | 0) - cy) ? i : m, celdas[0]);
      res.push({ puerta, celdas, tam: celdas.length, dist: Math.round(suma / celdas.length), centro });
    };
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (base[i] < 0 || !tapable(i)) continue;
        if (!pasa(i - 1)) {
          const p = [];
          for (let k = 0; k < anchoMax && x + k < w - 1 && tapable(i + k); k++) {
            p.push(i + k);
            if (!pasa(i + k + 1)) {
              probar([...p]);
              break;
            }
          }
        }
        if (!pasa(i - w)) {
          const p = [];
          for (let k = 0; k < anchoMax && y + k < h - 1 && tapable(i + k * w); k++) {
            p.push(i + k * w);
            if (!pasa(i + (k + 1) * w)) {
              probar([...p]);
              break;
            }
          }
        }
      }
    }
    const porZona = /* @__PURE__ */ new Map();
    for (const r of res) {
      const k = r.celdas[0] + ":" + r.tam;
      const o = porZona.get(k);
      if (!o || r.puerta.length < o.puerta.length) porZona.set(k, r);
    }
    return [...porZona.values()].sort((a, b) => b.dist - a.dist);
  }

  // adapters/onepiece.js
  var onepiece_exports = {};
  __export(onepiece_exports, {
    MUNDO: () => MUNDO,
    generarIsla: () => generarIsla
  });
  var MUNDO = { x0: -1408, x1: 1408, y0: -892, y1: 644 };
  var SPAWN = [0, 0];
  var RADIO_JUGADOR = 14;
  var ZONA_SPAWN = 260;
  var MARGEN_COSTA = 70;
  function generarIsla(semilla, bioma, opciones = {}) {
    var _a;
    const res = firstValid(semilla, (s) => intento(s, bioma, opciones), (_a = opciones.maxIntentos) != null ? _a : 30);
    const { mapa, check } = res;
    return {
      ...mapa,
      id: `gen_${bioma.id}_${String(semilla).replace(/[^\w-]/g, "")}`,
      semilla,
      semillaReal: res.semillaReal,
      intentos: res.intentos,
      stats: { valido: check.ok, motivo: check.motivo, accesible: +(check.ratio * 100).toFixed(1), area: Math.round(check.area) }
    };
  }
  function intento(semilla, bioma, { escala = 1 } = {}) {
    var _a, _b, _c, _d, _e;
    const rng = createRng(semilla);
    const cy = (MUNDO.y0 + MUNDO.y1) / 2;
    const rx = (MUNDO.x1 - MUNDO.x0) / 2 - 60, ry = (MUNDO.y1 - MUNDO.y0) / 2 - 50;
    const forma = island(`${semilla}|isla`, {
      cx: 0,
      cy,
      rx: rx * escala,
      ry: ry * escala,
      rugosidad: (_b = (_a = bioma.isla) == null ? void 0 : _a.rugosidad) != null ? _b : 0.35,
      detalle: (_d = (_c = bioma.isla) == null ? void 0 : _c.detalle) != null ? _d : 1.6,
      puntos: 96,
      suavizado: 3
    });
    const walkPoly = roundPoly(forma);
    const b = polyBounds(walkPoly);
    const rObs = rng.fork("obstaculos");
    const lejosDeTodo = (x, y) => pointInPoly(x, y, walkPoly) && distToPolyEdge(x, y, walkPoly) > MARGEN_COSTA && Math.hypot(x - SPAWN[0], y - SPAWN[1]) > ZONA_SPAWN;
    const puntos = poissonDisk(rObs, b, (_e = bioma.separacion) != null ? _e : 220, lejosDeTodo);
    const obstaculos = [];
    for (const [x, y] of puntos) {
      const t = rObs.weighted(bioma.obstaculos);
      const r = Math.round(rObs.range(t.r[0], t.r[1]));
      const largo = rObs.range(t.largo[0], t.largo[1]);
      const ang = rObs.range(0, Math.PI);
      const dx = Math.cos(ang) * largo / 2, dy = Math.sin(ang) * largo / 2;
      const c = { ax: +(x - dx).toFixed(1), ay: +(y - dy).toFixed(1), bx: +(x + dx).toFixed(1), by: +(y + dy).toFixed(1), r, tipo: t.tipo, color: t.color };
      const extremosOk = [[c.ax, c.ay], [c.bx, c.by]].every(([px, py]) => pointInPoly(px, py, walkPoly) && distToPolyEdge(px, py, walkPoly) > r);
      if (extremosOk && !capsuleHit(c, SPAWN[0], SPAWN[1], ZONA_SPAWN * 0.6)) obstaculos.push(c);
    }
    const rDec = rng.fork("decoracion");
    const decoracion = [];
    for (const d of bioma.decoracion || []) {
      const pts = poissonDisk(rDec.fork(d.tipo), b, d.separacion, (x, y) => pointInPoly(x, y, walkPoly) && !obstaculos.some((o) => capsuleHit(o, x, y, 8)));
      for (const [x, y] of pts) decoracion.push({ tipo: d.tipo, color: d.color, x: Math.round(x), y: Math.round(y) });
    }
    const check = checkReachable({
      bounds: b,
      celda: 16,
      spawn: SPAWN,
      walkable: (x, y) => pointInPoly(x, y, walkPoly) && !obstaculos.some((o) => capsuleHit(o, x, y, RADIO_JUGADOR)),
      minRatio: 0.97,
      minArea: polyArea(walkPoly) * 0.5
    });
    return {
      mapa: { bioma: bioma.id, nombre: bioma.nombre, enemigosDe: bioma.enemigosDe, colores: bioma.colores, walkPoly, obstaculos, decoracion },
      check
    };
  }

  // adapters/pokedive.js
  var pokedive_exports = {};
  __export(pokedive_exports, {
    T: () => T,
    analizarPiso: () => analizarPiso,
    planearSala: () => planearSala,
    solida: () => solida
  });
  var T = {
    Floor: 0,
    Wall: 1,
    Water: 2,
    Grass: 3,
    Rock: 4,
    Lava: 5,
    Deep: 6,
    Boulder: 7,
    Thicket: 8,
    Quicksand: 9,
    CurrentE: 10,
    CurrentW: 11,
    CurrentS: 12,
    CurrentN: 13,
    Fire: 14,
    Ice: 15
  };
  var solida = (t) => t === T.Wall || t === T.Rock || t === T.Lava || t === T.Deep || t === T.Boulder || t === T.Thicket;
  var TS = 16;
  var casilla = (L, p) => Math.floor(p.y / TS) * L.width + Math.floor(p.x / TS);
  var centroPx = (L, i) => ({ x: i % L.width * TS + TS / 2, y: Math.floor(i / L.width) * TS + TS / 2 });
  function analizarPiso(L) {
    const w = L.width, h = L.height, tile = (i) => L.tiles[i / w | 0][i % w];
    const pasa = (i) => !solida(tile(i));
    const d = distancias(w, h, pasa, L.spawns.map((s) => casilla(L, s)));
    let caminables = 0, alcanzables = 0;
    for (let i = 0; i < w * h; i++) if (pasa(i)) {
      caminables++;
      if (d[i] >= 0) alcanzables++;
    }
    return {
      forma: L.shape,
      ancho: w,
      alto: h,
      caminables,
      alcanzables,
      hastaEscalera: d[casilla(L, L.stairs)],
      hastaRescate: d[casilla(L, L.rescue)],
      cofres: (L.chests || []).length,
      jefe: !!L.boss
    };
  }
  function planearSala(L, semilla, { abre = {}, ocupado = [], distMin = 12 } = {}) {
    var _a, _b;
    if (L.boss || L.arena) return null;
    const rng = createRng(`${semilla}|sala`);
    const w = L.width, h = L.height, tile = (i) => L.tiles[i / w | 0][i % w];
    const pasa = (i) => !solida(tile(i));
    const tapable = (i) => tile(i) === T.Floor || tile(i) === T.Grass;
    const inicios = L.spawns.map((s) => casilla(L, s));
    const importantes = [L.stairs, L.rescue, ...L.spawns, ...ocupado, (_a = L.camp) == null ? void 0 : _a.bag, (_b = L.camp) == null ? void 0 : _b.rope, L.landmark].filter(Boolean).map((p) => casilla(L, p));
    const bolsillos = buscarBolsillos({ w, h, pasa, tapable, inicios, importantes, min: 10, max: 70, anchoMax: 3 });
    const buenos = bolsillos.filter((b2) => b2.dist >= distMin);
    if (!buenos.length) return null;
    const b = buenos[Math.min(buenos.length - 1, rng.int(0, Math.min(2, buenos.length - 1)))];
    const material = abre.fuego && abre.golpeRoca ? rng.pick([T.Thicket, T.Boulder]) : abre.fuego ? T.Thicket : abre.golpeRoca ? T.Boulder : null;
    const mods = material === null ? [] : b.puerta.map((i) => [i, material]);
    const dPuerta = distancias(w, h, (i) => pasa(i) && (b.celdas.includes(i) || b.puerta.includes(i)), b.puerta);
    const libres = b.celdas.filter((i) => tile(i) === T.Floor || tile(i) === T.Grass).sort((x, y) => dPuerta[y] - dPuerta[x]);
    const n = b.tam >= 30 ? 3 : 2;
    const cofres = [];
    for (const i of libres) {
      if (cofres.length >= n) break;
      if (cofres.every((c) => Math.abs(c % w - i % w) + Math.abs((c / w | 0) - (i / w | 0)) >= 3)) cofres.push(i);
    }
    if (!cofres.length) return null;
    for (const c of cofres) {
      for (const j of [c - 1, c + 1, c - w, c + w]) {
        if (b.celdas.includes(j) && tile(j) === T.Floor && !cofres.includes(j) && rng.chance(0.6)) mods.push([j, T.Grass]);
      }
    }
    const tipo = material === null ? "guardian" : "secreta";
    const guardia = tipo === "guardian" ? centroPx(L, b.centro) : null;
    const aviso = tipo === "secreta" ? material === T.Thicket ? { es: "Hay algo tras unos matorrales\u2026", en: "Something hides behind the thickets\u2026", sub: { es: "Un ataque de Fuego los quema", en: "A Fire attack burns them" } } : { es: "Hay algo tras unas rocas\u2026", en: "Something hides behind the boulders\u2026", sub: { es: "Golpe Roca las rompe", en: "Rock Smash breaks them" } } : { es: "Un alfa guarda un tesoro en este piso", en: "An alpha guards a treasure on this floor", sub: { es: "V\xE9ncelo para llevarte sus cofres", en: "Beat it to claim its chests" } };
    return { tipo, mods, cofres: cofres.map((i) => centroPx(L, i)), guardia, puerta: b.puerta, celdas: b.celdas, aviso };
  }

  // adapters/pokeisaac.js
  var pokeisaac_exports = {};
  __export(pokeisaac_exports, {
    COLS: () => COLS,
    MAX_ROCAS: () => MAX_ROCAS,
    ROWS: () => ROWS,
    conectada: () => conectada,
    plantillas: () => plantillas
  });
  var COLS = 13;
  var ROWS = 7;
  var MAX_ROCAS = 12;
  var libre = (x, y) => x === 6 || y === 3 || Math.abs(x - 6) <= 1 && Math.abs(y - 3) <= 1;
  var ESTRATEGIAS = {
    // Cuadrante dibujado al azar y copiado en espejo a los 4 lados
    espejo4(rng) {
      const g = vacia();
      const n = rng.int(2, 3);
      for (let k = 0; k < n; k++) {
        const x = rng.int(0, 5), y = rng.int(0, 2);
        const largo = rng.int(1, 3), dx = rng.chance(0.5) ? 1 : 0;
        for (let i = 0; i < largo; i++) espejo(g, x + (dx ? i : 0), y + (dx ? 0 : i), 1, 4);
      }
      return g;
    },
    // Manchas de ruido, en espejo izquierda-derecha
    manchas(rng, noise) {
      const g = vacia(), ox = rng.range(0, 50), oy = rng.range(0, 50), umbral = rng.range(0.25, 0.42);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x <= 6; x++) {
        if (noise.fbm(ox + x * 0.45, oy + y * 0.45, { octaves: 2 }) > umbral) espejo(g, x, y, 1, 2);
      }
      return g;
    },
    // Muros cortos que forman pasillos (diagonales o en L), en espejo diagonal (giro de 180°)
    pasillos(rng) {
      const g = vacia();
      const n = rng.int(2, 3);
      for (let k = 0; k < n; k++) {
        let x = rng.int(0, 5), y = rng.int(0, 6);
        const [dx, dy] = rng.pick([[1, 0], [0, 1], [1, 1], [1, -1]]);
        for (let i = rng.int(2, 3); i > 0; i--) {
          poner(g, x, y, 1);
          poner(g, COLS - 1 - x, ROWS - 1 - y, 1);
          x += dx;
          y += dy;
        }
      }
      return g;
    },
    // Columnas sueltas con algunas "?" (cambian cada vez que sale la sala)
    columnas(rng) {
      const g = vacia();
      const paso = rng.pick([2, 3]);
      for (let x = rng.int(0, 1); x <= 5; x += paso) for (let y = rng.int(0, 1); y <= 2; y += 2) espejo(g, x, y, rng.chance(0.3) ? 2 : 1, 4);
      return g;
    },
    // Anillos o marcos alrededor de un punto del cuadrante
    anillo(rng) {
      const g = vacia();
      const cx = rng.int(1, 4), cy = rng.int(1, 1);
      for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
        if (rng.chance(0.75)) espejo(g, cx + dx, cy + dy, 1, 2);
      }
      return g;
    }
  };
  function vacia() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  }
  function poner(g, x, y, v) {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS && !libre(x, y)) g[y][x] = Math.max(g[y][x], v);
  }
  function espejo(g, x, y, v, modo) {
    poner(g, x, y, v);
    poner(g, COLS - 1 - x, y, v);
    if (modo === 4) {
      poner(g, x, ROWS - 1 - y, v);
      poner(g, COLS - 1 - x, ROWS - 1 - y, v);
    }
  }
  function conectada(g) {
    const vis = vacia(), pila = [[6, 3]];
    vis[3][6] = 1;
    while (pila.length) {
      const [x, y] = pila.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = x + dx, b = y + dy;
        if (a < 0 || b < 0 || a >= COLS || b >= ROWS || vis[b][a] || g[b][a]) continue;
        vis[b][a] = 1;
        pila.push([a, b]);
      }
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!g[y][x] && !vis[y][x]) return false;
    return true;
  }
  var aTexto = (g) => g.map((f) => f.map((v) => v === 1 ? "#" : v === 2 ? "?" : ".").join(""));
  function plantillas(semilla = "pokeisaac", n = 16, existentes = {}) {
    const rng = createRng(`${semilla}|plantillas`);
    const noise = createNoise(`${semilla}|ruido`);
    const vistas = new Set(Object.values(existentes).map((t) => t.join("|")));
    const out = {};
    const nombres = Object.keys(ESTRATEGIAS);
    let k = 0;
    for (let intento2 = 0; intento2 < 4e3 && k < n; intento2++) {
      const estr = nombres[intento2 % nombres.length];
      const g = ESTRATEGIAS[estr](rng, noise);
      const rocas = g.flat().filter((v) => v === 1).length, dudosas = g.flat().filter((v) => v === 2).length;
      if (rocas + dudosas < 6 || rocas + dudosas > MAX_ROCAS || !conectada(g)) continue;
      const t = aTexto(g);
      const vars = [t, [...t].reverse(), t.map((f) => [...f].reverse().join("")), [...t].reverse().map((f) => [...f].reverse().join(""))];
      if (vars.some((v) => vistas.has(v.join("|")))) continue;
      vars.forEach((v) => vistas.add(v.join("|")));
      out[`wg_${estr}_${++k}`] = t;
    }
    return out;
  }

  // biomas/onepiece/desierto.json
  var desierto_default = {
    id: "desierto",
    nombre: "Isla del desierto",
    enemigosDe: "alabasta",
    colores: { mar: "#2a7fb8", orilla: "#e9d39b", suelo: "#d9b46a", borde: "#a8834a" },
    isla: { rugosidad: 0.42, detalle: 1.4 },
    separacion: 230,
    obstaculos: [
      { tipo: "roca", peso: 5, color: "#8c6a3f", r: [22, 38], largo: [0, 40] },
      { tipo: "palmera", peso: 2, color: "#4f8a3a", r: [16, 20], largo: [0, 0] },
      { tipo: "ruina", peso: 1, color: "#b89562", r: [12, 16], largo: [140, 260] }
    ],
    decoracion: [
      { tipo: "duna", color: "#e2c27f", separacion: 120 },
      { tipo: "huesos", color: "#efe6d0", separacion: 340 }
    ]
  };

  // biomas/onepiece/nieve.json
  var nieve_default = {
    id: "nieve",
    nombre: "Isla invernal",
    enemigosDe: "drum",
    colores: { mar: "#3a6f9a", orilla: "#dfe8ef", suelo: "#f4f8fb", borde: "#9fb3c4" },
    isla: { rugosidad: 0.3, detalle: 1.8 },
    separacion: 210,
    obstaculos: [
      { tipo: "pino", peso: 5, color: "#2f5a44", r: [18, 24], largo: [0, 0] },
      { tipo: "roca", peso: 2, color: "#7d8c99", r: [24, 36], largo: [0, 30] },
      { tipo: "hielo", peso: 1, color: "#a9d6ef", r: [14, 18], largo: [90, 180] }
    ],
    decoracion: [
      { tipo: "monticulo", color: "#ffffff", separacion: 110 },
      { tipo: "huellas", color: "#cfdbe5", separacion: 260 }
    ]
  };

  // biomas/onepiece/bosque.json
  var bosque_default = {
    id: "bosque",
    nombre: "Isla selv\xE1tica",
    enemigosDe: "syrup",
    colores: { mar: "#24889f", orilla: "#e6d8a3", suelo: "#6fae4f", borde: "#3f7a35" },
    isla: { rugosidad: 0.5, detalle: 2.1 },
    separacion: 190,
    obstaculos: [
      { tipo: "arbol", peso: 6, color: "#2e6b2c", r: [20, 30], largo: [0, 0] },
      { tipo: "tronco", peso: 2, color: "#7a5230", r: [12, 16], largo: [70, 150] },
      { tipo: "roca", peso: 1, color: "#7c7c70", r: [20, 30], largo: [0, 20] }
    ],
    decoracion: [
      { tipo: "flores", color: "#f2d14b", separacion: 130 },
      { tipo: "arbusto", color: "#4d9440", separacion: 100 }
    ]
  };

  // biomas/onepiece/ciudad.json
  var ciudad_default = {
    id: "ciudad",
    nombre: "Puerto de la Marina",
    enemigosDe: "shelltown",
    colores: { mar: "#2c78a8", orilla: "#c9b98f", suelo: "#b7aa92", borde: "#6f6454" },
    isla: { rugosidad: 0.22, detalle: 1.2 },
    separacion: 250,
    obstaculos: [
      { tipo: "casa", peso: 4, color: "#8a5a44", r: [34, 48], largo: [40, 110] },
      { tipo: "barril", peso: 3, color: "#6b4a2b", r: [14, 18], largo: [0, 0] },
      { tipo: "muro", peso: 1, color: "#9c9384", r: [10, 13], largo: [160, 300] }
    ],
    decoracion: [
      { tipo: "adoquin", color: "#a59a84", separacion: 90 },
      { tipo: "farol", color: "#f5d77a", separacion: 300 }
    ]
  };

  // src/index.js
  var version = "0.4";
  var core = { createRng, hashSeed, createNoise, geom: geom_exports, shapes: shapes_exports, poissonDisk, validate: validate_exports, analisis: analisis_exports };
  var biomas = {
    onepiece: { desierto: desierto_default, nieve: nieve_default, bosque: bosque_default, ciudad: ciudad_default }
  };
  var adapters = {
    onepiece: {
      ...onepiece_exports,
      /** Atajo: generarIsla(semilla, "nieve") */
      isla: (semilla, bioma = "desierto", opciones) => generarIsla(semilla, typeof bioma === "string" ? biomas.onepiece[bioma] : bioma, opciones)
    },
    pokedive: pokedive_exports,
    pokeisaac: pokeisaac_exports
  };
  return __toCommonJS(index_exports);
})();
