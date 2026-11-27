// Plantillas de sala de worldgen (repo moportor6-art/worldgen, js/worldgen.js = dist/worldgen.js).
// El juego elige el interior de cada sala normal entre sus plantillas (Room.TEMPLATES) con pesos (LAYOUTS_V10).
// Aquí se añaden 16 plantillas nuevas con el mismo peso que las últimas que puso el autor (1.1): salen en
// ~3 de cada 10 salas. Todas cumplen sus reglas (cruz central libre, sin zonas cerradas, 6-12 rocas).
// La biblioteca sale de una semilla fija: todos los teléfonos con la misma versión tienen las mismas
// (necesario para el cooperativo, donde cada uno arma las salas con la semilla del piso).
(function () {
  'use strict';
  var E = window.PI_NS, WG = window.WorldGen;
  if (!E || !E.Room || !WG || !WG.adapters || !WG.adapters.pokeisaac) return;
  var R = E.Room, PESO = 1.1;
  if (!R.TEMPLATES || !R.LAYOUTS_V10 || !R.LAYOUTS_V2) return;
  var nuevas = WG.adapters.pokeisaac.plantillas('pokeisaac-1', 16, R.TEMPLATES);
  var nombres = Object.keys(nuevas);
  nombres.forEach(function (k) {
    R.TEMPLATES[k] = nuevas[k];
    R.LAYOUTS_V10.push([k, PESO]);
    R.LAYOUTS_V2.push([k, PESO]);
  });
  window.PI_WG = { version: WG.version, plantillas: nombres };
})();
