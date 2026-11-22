# PokéIsaac — port a Android

Port no oficial de [PokéIsaac](https://pokeisaac.com) a Android, hecho por reto del creador.

- **100 % offline:** el juego completo (código, sprites, música y sonidos) va dentro del APK. No usa cuentas ni servidor.
- **Cooperativo por wifi:** el teléfono que crea la sala hace de servidor y la anuncia en la red local. Los demás la ven en «Salas en tu wifi» o entran con el código.
- **Cuenta local:** el Gacha, las misiones, el Mercado, los huevos y los eventos funcionan sin internet: el juego trae su propio servidor simulado y la app lo usa para guardar la cuenta en el teléfono (entra solo como invitado).
- **Conexión (Opciones → Datos → App Android):** WIFI LOCAL (por defecto, sin internet) o INTERNET, que entra con la cuenta oficial de pokeisaac.com (correo y contraseña) para tener clasificación, amigos, clan, chat y arena. El cooperativo es siempre por wifi. En la misma sección: buscar actualizaciones, ver las versiones y volver a la versión de la APK.
- **Se actualiza sola, gastando pocos datos:** al abrir, mira si hay versión nueva (unos KB) y solo entonces baja la lista de archivos (~1 MB). Después baja únicamente los archivos del juego que cambiaron, sin reinstalar. La APK completa (~245 MB) solo se pide cuando el juego necesita la parte Android nueva: eso se marca a mano en `android/NATIVO`. Con datos móviles avisa para que lo hagas con wifi. Si una actualización no arranca, vuelve sola a la anterior.
- **Auto-aim (AUTO TOTAL):** en táctil dispara solo, primero al enemigo más cercano y después a los objetos que se rompen. Arrastrar en el lado derecho apunta a mano. Se cambia en Opciones → Táctil → Disparar con.
- **Pantallas de 90/120/144 Hz:** la app pide la frecuencia más alta de la pantalla; en Opciones → Gráficos → Límite de FPS hay SIN LÍMITE, 120, 60 y 30.
- **APK automático:** cada cambio en `main` compila el APK con GitHub Actions. Lo encuentras en *Releases* como `<versión>.apk` (la versión está en el archivo `VERSION`).

## Estructura

| Carpeta | Qué hay |
|---|---|
| `web/` | El juego tal cual, con `index.html` adaptado y `js/lan/lan-boot.js` (modo offline + cooperativo LAN) |
| `android/` | App nativa: WebView que sirve `web/` desde el APK, relay WebSocket y descubrimiento de salas por UDP |
| `tools/` | Scripts para bajar/actualizar el juego, `patch_game.py` (parches del port sobre `js/pokeisaac.js`: cuenta local, AUTO TOTAL, FPS; se vuelve a correr al bajar una versión nueva) y un relay en Node para probar el cooperativo en PC |

## Probar en PC

```
cd tools && npm i && node lan-relay.js 8787 ../web
```
Abre `http://localhost:8787/index.html?packs=assets/` en dos pestañas para probar el cooperativo.
