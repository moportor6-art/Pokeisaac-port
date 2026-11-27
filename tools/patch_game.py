#!/usr/bin/env python3
"""Parches del port sobre js/pokeisaac.js (el juego original, minificado). Uso: patch_game.py web/js/pokeisaac.js

Se puede volver a correr cuando se baja una versión nueva del juego: cada parche busca su texto exacto,
no hace nada si ya está puesto y avisa si el juego cambió y hay que revisarlo a mano.

1. Base de datos local (window.PI_LOCAL_DB, lo pone js/lan/lan-boot.js): el juego trae su propio servidor
   simulado ("mockauth"), que guarda la cuenta en el teléfono. Con él funcionan sin internet el Gacha, las
   misiones, la tienda, los huevos, los eventos… todo lo que en la web vive en el servidor.
2. Apuntado AUTO TOTAL en táctil: dispara solo, primero al enemigo más cercano y, si no queda ninguno,
   a los objetos que se rompen (rocas, vasijas…). Arrastrar en el lado derecho apunta a mano.
3. Límite de FPS: además de SIN LÍMITE y 30, opciones de 120 y 60.
7. window.PI_NS (espacio de nombres del juego) para las plantillas de sala de worldgen (js/salas-worldgen.js).
"""
import sys

path = sys.argv[1]
s = open(path, encoding="utf-8").read()
cambios, errores = 0, []


def parche(nombre, viejo, nuevo, veces=1):
    global s, cambios
    if nuevo in s:
        return
    n = s.count(viejo)
    if n != veces:
        errores.append(f"{nombre}: se esperaba {veces} vez/veces y está {n}")
        return
    s = s.replace(viejo, nuevo)
    cambios += 1


# 1. Servidor simulado local
parche("db local", 'y="1"===a.mockauth;let v=null;', 'y="1"===a.mockauth||!!window.PI_LOCAL_DB;let v=null;')
parche("db local (espera)", "delay:null!=a.mockdelay?+a.mockdelay:250,",
       "delay:null!=a.mockdelay?+a.mockdelay:window.PI_LOCAL_DB?30:250,")

# 2. AUTO TOTAL
parche("autoaim: modo", 'i=f(a)?function(e){const a=s().touchAim||"stick";if("auto"===a){',
       'i=f(a)?function(e){const a=s().touchAim||"stick";if("auto"===a||"autofull"===a){')
parche("autoaim: sin mantener", 'return x=a,a}}if(null==A)return null;const o=N(e,null)||',
       'return x=a,a}}if(null==A&&"autofull"!==s().touchAim)return null;const o=N(e,null)||')
parche("autoaim: sin blanco no dispara", "r<s&&(s=r,t={x:o/r,y:n/r})}return t}(e)||x;return x=o,o}",
       "r<s&&(s=r,t={x:o/r,y:n/r})}return t}(e)||(null!=A?x:null);return o&&(x=o),o}")
parche("autoaim: tocar", 'if("aim"===x&&"auto"===w)return void(null==A&&(A=c));',
       'if("aim"===x&&("auto"===w||"autofull"===w))return void(null==A&&(A=c));')
parche("autoaim: dibujo", '"aim"===e.kind&&"auto"===s().touchAim?null!=A:!!r;',
       '"aim"===e.kind&&("auto"===s().touchAim||"autofull"===s().touchAim)?null!=A:!!r;')
parche("autoaim: ajustes",
       '{key:"touchAim",label:"Disparar con",kind:"sw",values:["stick","dir4","auto"],names:["STICK","4 FLECHAS","AUTO"],'
       'desc:"AUTO: mantenlo y apunta solo al enemigo más cercano."}',
       '{key:"touchAim",label:"Disparar con",kind:"sw",values:["autofull","stick","dir4","auto"],'
       'names:["AUTO TOTAL","STICK","4 FLECHAS","AUTO"],'
       'desc:"AUTO TOTAL: dispara solo, primero a los enemigos y luego a lo que se rompe. AUTO: mantenlo y apunta solo al enemigo más cercano."}')
parche("autoaim: ayuda", 'auto:"Mantén AUTO: disparar"}[e.Settings.touchAim]',
       'auto:"Mantén AUTO: disparar",autofull:"Dispara solo · arrastra: apuntar a mano"}[e.Settings.touchAim]')

# 3. FPS
parche("fps", 'values:[0,30],names:["SIN LÍMITE","30 FPS"],desc:"Ahorra batería en portátiles."',
       'values:[0,120,60,30],names:["SIN LÍMITE","120 FPS","60 FPS","30 FPS"],'
       'desc:"SIN LÍMITE va a la frecuencia de tu pantalla (90/120/144 Hz si la tiene). 60 o 30 ahorran batería."')

# 4. Opciones → Datos → App Android: actualizaciones, historial y volver a la versión de la APK.
#    Las acciones las hace window.PI_PORT (js/lan/lan-boot.js).
parche("app: filas", '{key:"directConn",label:"Conexión directa (cooperativo)",',
       '...(window.PI_PORT?[{id:"portUpdate",label:"Actualizaciones",kind:"btn",btn:"Buscar",desc:"Si solo cambió el juego, baja únicamente los archivos nuevos."},'
       '{id:"portHistory",label:"Versiones",kind:"btn",btn:"Ver",desc:"Las versiones publicadas del port y sus novedades."},'
       '{id:"portReset",label:"Versión de la APK",kind:"btn",btn:"Volver",danger:!0,desc:"Si algo falla tras una actualización: vuelve al juego que trae la APK."}]:[]),'
       '{key:"directConn",label:"Conexión directa (cooperativo)",')
parche("app: grupo", 'Datos:[["Cuenta y datos",["save","cloud","report","directConn","reset"]]]',
       'Datos:[["Cuenta y datos",["save","cloud","report","directConn","reset"]],["App Android",["portUpdate","portHistory","portReset"]]]')
parche("app: acciones", 'else"redeem"===o.id?', 'else/^port/.test(o.id)&&window.PI_PORT?window.PI_PORT.action(o.id,e):"redeem"===o.id?')

# 5. Sin servidor: fuera los botones de Amigos, Clan y Chat del menú principal (necesitan otros jugadores en
#    internet). Misiones, Gacha, Mercado, Pokédex y Ranking siguen, con la cuenta guardada en el teléfono.
parche("menú: lado derecho", 've=["missions","friends","clan","chat"],', 've=window.PI_LAN?["missions"]:["missions","friends","clan","chat"],')
parche("menú: botones que no están", 'd=(e,r,l,c,d,u)=>{const p=s(e),m=i(e)||n(e),', 'd=(e,r,l,c,d,u)=>{const p=s(e);if(!p)return;const m=i(e)||n(e),')

# 6. Todo local: sin crear cuenta, sin donaciones y sin enlaces que saquen del juego.
L = "window.PI_LAN"
parche("sin donar: botón de Ko-fi", 'n.drawKofiBtn=function(e,a,t,s,n){', 'n.drawKofiBtn=function(e,a,t,s,n){if(' + L + ')return;')
parche("sin donar: zona del botón", 'return o.kofi=(()=>{', 'return o.kofi=' + L + '?{x:-9999,y:-9999,w:0,h:0}:(()=>{')
parche("sin donar: aviso de Ko-fi", 'if(o||e.query&&e.query.nokofi)return;', 'if(o||' + L + '||e.query&&e.query.nokofi)return;')
parche("sin donar: ventana de Ko-fi", 'function q(){if(R)return;', 'function q(){if(R||' + L + ')return;')
parche("sin donar: Apoyar el juego", 'e.Support={open:M,', 'e.Support={open:' + L + '?()=>{}:M,')
parche("sin donar: Mercado", 'function xe(e){const a=r.st&&r.st.items||[];',
       'function xe(e){const L0=xe0(e);return ' + L + '&&Array.isArray(L0)?L0.filter((i=>!i||!(i.kofi||i.ks||i.eur))):L0}'
       'function xe0(e){const a=r.st&&r.st.items||[];')
parche("sin enlaces: Discord del menú", 'const xe=["discord","wiki","credits"];', 'const xe=' + L + '?["wiki","credits"]:["discord","wiki","credits"];')
parche("sin enlaces: menú ≡", '].filter((([a])=>!e.Featured||!e.Featured.shown||e.Featured.shown(a))),ze=',
       '].filter((([a])=>!e.Featured||!e.Featured.shown||e.Featured.shown(a))).filter((([a])=>!' + L + '||!["redeem","apps","mods"].includes(a))),ze=')
parche("sin cuenta: tarjeta del perfil", 'T.user.isGuest?T.ui.show("upgrade"):T.ui.show("account")',
       'T.user.isGuest&&!' + L + '?T.ui.show("upgrade"):T.ui.show("account")')
parche("sin cuenta: texto del perfil", 'T.user.isGuest?"Guardar progreso":"Mi cuenta"', 'T.user.isGuest&&!' + L + '?"Guardar progreso":"Mi cuenta"')
parche("sin cuenta: nube", '{id:"cloud",label:"Ajustes en la nube",kind:"info"},', '...(' + L + '?[]:[{id:"cloud",label:"Ajustes en la nube",kind:"info"}]),')
parche("sin servidor: reportar", '{id:"report",label:"Reportar un fallo",kind:"btn",btn:"Reportar",desc:"Cuéntanos qué ha fallado; puedes adjuntar la versión y el último error."},',
       '...(' + L + '?[]:[{id:"report",label:"Reportar un fallo",kind:"btn",btn:"Reportar",desc:"Cuéntanos qué ha fallado; puedes adjuntar la versión y el último error."}]),')

parche("sin cuenta: etiqueta", 'T.tag=function(){return"loading"===T.status?', 'T.tag=function(){return ' + L + '?{text:"Local",color:"#6fdc5a"}:"loading"===T.status?')
parche("sin cuenta: perfil", 'M="loading"===A?"CONECTANDO":S?n.user.isGuest?"EN LÍNEA · INVITADO":"EN LÍNEA":"DESCONECTADO"',
       'M=' + L + '?"EN ESTE TELÉFONO":"loading"===A?"CONECTANDO":S?n.user.isGuest?"EN LÍNEA · INVITADO":"EN LÍNEA":"DESCONECTADO"')

# 7. worldgen: deja el espacio de nombres del juego en window.PI_NS para que js/salas-worldgen.js pueda añadir
#    plantillas de sala (Room.TEMPLATES / LAYOUTS_V10) sin tocar el generador.
parche("worldgen: espacio de nombres", "!function(){var e={};", "!function(){var e=window.PI_NS={};")

# Parche del 02/11/2026 que solo hablaba de Ko-fi: fuera de la lista de PARCHES
i = s.find('{id:"2026-11-02-2",ver:"1.1.1"')
if i >= 0:
    j = s.index('{id:"2026-11-02-1",', i)
    s = s[:i] + s[j:]
    cambios += 1

# Textos de aspectos que decían que se consiguen pagando
import re
for viejo, nuevo in [
    (r"Por apoyar el juego en Ko-fi(?: \((?:Bronze|Silver|Gold|Diamond|Legend|Leyenda)\))?\.", "Aspecto especial."),
    (r"For supporting the game on Ko-fi(?: \((?:Bronze|Silver|Gold|Diamond|Legend)\))?\.", "Special look."),
    (r"Pour avoir soutenu le jeu sur Ko-fi(?: \((?:Bronze|Silver|Gold|Diamond|Légende|Legend)\))?\.", "Apparence spéciale."),
    (r"Solo para los 5 Legend de Ko-fi\.", "Aspecto legendario."),
    (r"Por mejorar el servidor de Discord(?: \(3 meses\))?\.", "Aspecto especial."),
    (r"Lo tienen los Diamond de Ko-fi \(50 € donados en total\)\.", "Aspecto especial."),
]:
    s, n = re.subn(viejo, nuevo, s)
    cambios += n > 0

# Traducciones de los textos nuevos (inglés y francés van dentro del juego)
D_ES_AIM = "AUTO TOTAL: dispara solo, primero a los enemigos y luego a lo que se rompe. AUTO: mantenlo y apunta solo al enemigo más cercano."
D_ES_FPS = "SIN LÍMITE va a la frecuencia de tu pantalla (90/120/144 Hz si la tiene). 60 o 30 ahorran batería."
for viejo, extra in [
    ('"SIN LÍMITE":"UNLIMITED"', {"AUTO TOTAL": "FULL AUTO", D_ES_AIM: "FULL AUTO: fires on its own, enemies first and then breakable objects. AUTO: hold it and it aims at the nearest enemy.",
                                   D_ES_FPS: "UNLIMITED follows your screen's refresh rate (90/120/144 Hz if it has it). 60 or 30 save battery.",
                                   "Dispara solo · arrastra: apuntar a mano": "Fires on its own · drag: aim by hand",
                                   "App Android": "Android app", "Conexión": "Connection", "Actualizaciones": "Updates", "Versiones": "Versions",
                                   "Versión de la APK": "APK version", "EN ESTE TELÉFONO": "ON THIS PHONE"}),
    ('"SIN LÍMITE":"ILLIMITÉ"', {"AUTO TOTAL": "AUTO TOTAL", D_ES_AIM: "AUTO TOTAL : tire tout seul, d'abord sur les ennemis puis sur les objets cassables. AUTO : maintenez-le et il vise l'ennemi le plus proche.",
                                  D_ES_FPS: "ILLIMITÉ suit la fréquence de votre écran (90/120/144 Hz). 60 ou 30 économisent la batterie.",
                                  "Dispara solo · arrastra: apuntar a mano": "Tire tout seul · glisser : viser à la main",
                                  "EN ESTE TELÉFONO": "SUR CE TÉLÉPHONE"}),
]:
    import json
    nuevo = viejo + "," + ",".join(json.dumps(k, ensure_ascii=False) + ":" + json.dumps(v, ensure_ascii=False) for k, v in extra.items())
    parche("traducción " + viejo, viejo, nuevo)

open(path, "w", encoding="utf-8").write(s)
print(f"{cambios} parches aplicados")
if errores:
    print("REVISAR:\n  " + "\n  ".join(errores))
    sys.exit(1)
