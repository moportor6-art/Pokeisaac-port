#!/usr/bin/env python3
"""Adapta index.html del juego original para la app: sin Supabase ni CDN ni Google Fonts,
con lan-boot.js antes del juego. Uso: patch_index.py entrada.html salida.html"""
import re, sys

src = open(sys.argv[1], encoding="utf-8").read()
s = src

# Fuente local en vez de Google Fonts
s = re.sub(r'\s*<link rel="preconnect" href="https://fonts.googleapis.com">', "", s)
s = re.sub(r'<link href="https://fonts.googleapis.com/css2\?family=Press\+Start\+2P[^"]*" rel="stylesheet">',
           '<link rel="stylesheet" href="fonts/press-start-2p.css">', s)

# Supabase fuera (el juego detecta que no está y funciona en local)
s = re.sub(r'\s*<script src="js/vendor/supabase-[^"]*"></script>', "", s)

# Modo offline + cooperativo LAN antes de todo lo demás
s = s.replace('<script src="js/vendor/activity-boot.js',
              '<script src="js/lan/lan-boot.js"></script>\n  <script src="js/vendor/activity-boot.js', 1)

# Plantillas de sala de worldgen justo después del juego
s = re.sub(r'(<script src="js/pokeisaac\.js[^"]*"></script>)',
           r'\1\n  <script src="js/worldgen.js"></script>\n  <script src="js/salas-worldgen.js"></script>', s, count=1)

# Sin metadatos de la web pública
s = re.sub(r'\s*<link rel="canonical"[^>]*>', "", s)
s = re.sub(r'\s*<script type="application/ld\+json">.*?</script>', "", s, flags=re.S)

assert "salas-worldgen.js" in s and "lan-boot.js" in s and "supabase-" not in s.split("<body>")[1], "parche incompleto"
open(sys.argv[2], "w", encoding="utf-8").write(s)
print("index.html adaptado")
