# PokéIsaac — port a Android

Port no oficial de [PokéIsaac](https://pokeisaac.com) a Android, hecho por reto del creador.

- **100 % offline:** el juego completo (código, sprites, música y sonidos) va dentro del APK. No usa cuentas ni servidor.
- **Cooperativo por wifi:** el teléfono que crea la sala hace de servidor y la anuncia en la red local. Los demás la ven en «Salas en tu wifi» o entran con el código.
- **APK automático:** cada cambio en `main` compila el APK con GitHub Actions. Lo encuentras en *Releases* como `<versión>.apk` (la versión está en el archivo `VERSION`).

## Estructura

| Carpeta | Qué hay |
|---|---|
| `web/` | El juego tal cual, con `index.html` adaptado y `js/lan/lan-boot.js` (modo offline + cooperativo LAN) |
| `android/` | App nativa: WebView que sirve `web/` desde el APK, relay WebSocket y descubrimiento de salas por UDP |
| `tools/` | Scripts para bajar/actualizar el juego y un relay en Node para probar el cooperativo en PC |

## Probar en PC

```
cd tools && npm i && node lan-relay.js 8787 ../web
```
Abre `http://localhost:8787/index.html?packs=assets/` en dos pestañas para probar el cooperativo.
