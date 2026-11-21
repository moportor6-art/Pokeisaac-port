#!/usr/bin/env python3
"""Descarga una lista de rutas a una carpeta. Uso: mirror.py BASE_URL LISTA DEST [hilos]
Cada línea de LISTA es una ruta relativa (destino = DEST/ruta, URL = BASE_URL + ruta).
Una línea "ruta_destino<TAB>url_completa" permite fijar la URL. Reintenta; registra 404 en DEST/_missing.txt."""
import sys, os, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

base, lst, dest = sys.argv[1], sys.argv[2], sys.argv[3]
threads = int(sys.argv[4]) if len(sys.argv) > 4 else 16
items = []
for ln in open(lst, encoding="utf-8"):
    ln = ln.rstrip("\n")
    if not ln.strip(): continue
    if "\t" in ln:
        p, u = ln.split("\t", 1)
    else:
        p, u = ln, base + urllib.request.quote(ln)
    items.append((p, u))

missing, failed, done = [], [], [0]

def get(item):
    p, u = item
    out = os.path.join(dest, p)
    if os.path.exists(out) and os.path.getsize(out) > 0: return
    for a in range(4):
        try:
            req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 PokeIsaacPort"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
            with open(out + ".part", "wb") as f: f.write(data)
            os.replace(out + ".part", out)
            done[0] += 1
            return
        except urllib.error.HTTPError as e:
            if e.code in (404, 403, 400): missing.append(p); return
            time.sleep(1 + a * 2)
        except Exception:
            time.sleep(1 + a * 2)
    failed.append(p)

with ThreadPoolExecutor(threads) as ex:
    list(ex.map(get, items))
with open(os.path.join(dest, "_missing.txt"), "a") as f:
    for m in missing: f.write(m + "\n")
print(f"ok={done[0]} faltan={len(missing)} fallos={len(failed)} total={len(items)}")
for x in failed[:20]: print("FALLO", x)
