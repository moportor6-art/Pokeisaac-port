# PokéIsaac — port a Android

Port no oficial de [PokéIsaac](https://pokeisaac.com) a Android, hecho por reto del creador.

- **100 % offline:** el juego completo (código, sprites, música y sonidos) va dentro del APK. No usa cuentas ni servidor.
- **Cooperativo por wifi:** el teléfono que crea la sala hace de servidor y la anuncia en la red local. Los demás la ven en «Salas en tu wifi» o entran con el código.
- **Cuenta local:** el Gacha, las misiones, el Mercado, los huevos y los eventos funcionan sin internet: el juego trae su propio servidor simulado y la app lo usa para guardar la cuenta en el teléfono (entra solo como invitado).
- **Opciones → Datos → App Android:** buscar actualizaciones, ver las versiones y volver a la versión de la APK.
- **Sin servidor:** todo funciona sin internet y sin cuentas en línea; el multijugador es el cooperativo por salas en la wifi. Los botones de Amigos, Clan y Chat no están.
- **Todo local, sin pagos:** no hay crear cuenta ni iniciar sesión (en «Mi cuenta» solo quedan avatar y nombre), ni botones o avisos de Ko-fi, ni aspectos de pago en el Mercado, ni enlaces que saquen del juego (Discord, web…). Los créditos al creador siguen dentro del juego.
- **Se actualiza sola, gastando pocos datos:** al abrir, mira si hay versión nueva (unos KB) y solo entonces baja la lista de archivos (~1 MB). Después baja únicamente los archivos del juego que cambiaron, sin reinstalar. La APK completa (~245 MB) solo se pide cuando el juego necesita la parte Android nueva: eso se marca a mano en `android/NATIVO`. Con datos móviles avisa para que lo hagas con wifi. Si una actualización no arranca, vuelve sola a la anterior.
- **Auto-aim (AUTO TOTAL):** en táctil dispara solo, primero al enemigo más cercano y después a los objetos que se rompen. Arrastrar en el lado derecho apunta a mano. Se cambia en Opciones → Táctil → Disparar con.
- **Pantallas de 90/120/144 Hz:** la app pide la frecuencia más alta de la pantalla; en Opciones → Gráficos → Límite de FPS hay SIN LÍMITE, 120, 60 y 30.
- **Salas nuevas** (0.7, [worldgen](https://github.com/moportor6-art/worldgen)): 16 plantillas de sala más (manchas,
  pasillos, columnas, anillos…) que el juego elige igual que las suyas, en ~3 de cada 10 salas. Cumplen sus reglas: la
  cruz de las puertas libre, sin zonas cerradas y de 6 a 12 rocas. Salen de una semilla fija, así que en el
  cooperativo todos ven las mismas salas (`web/js/salas-worldgen.js`, `web/js/worldgen.js`).
- **APK automático:** cada cambio en `main` compila el APK con GitHub Actions. Lo encuentras en *Releases* como `<versión>.apk` (la versión está en el archivo `VERSION`).

## Estructura

| Carpeta | Qué hay |
|---|---|
| `web/` | El juego tal cual, con `index.html` adaptado y `js/lan/lan-boot.js` (modo offline + cooperativo LAN) |
| `android/` | App nativa: WebView que sirve `web/` desde el APK, relay WebSocket y descubrimiento de salas por UDP |
| `tools/` | Scripts para bajar/actualizar el juego, `patch_game.py` (parches del port sobre `js/pokeisaac.js`: cuenta local, AUTO TOTAL, FPS, `window.PI_NS` para worldgen; se vuelve a correr al bajar una versión nueva) y un relay en Node para probar el cooperativo en PC |

## Probar en PC

```
cd tools && npm i && node lan-relay.js 8787 ../web
```
Abre `http://localhost:8787/index.html?packs=assets/` en dos pestañas para probar el cooperativo.
