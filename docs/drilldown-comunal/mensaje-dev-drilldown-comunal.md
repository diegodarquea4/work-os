# Drill-down comunal en vista Mapa — todo lo necesario para implementar

Hola — te paso el paquete completo del nuevo nivel comunal del Mapa. Está todo commiteado en el repo; este mensaje es el índice + las decisiones cerradas. La referencia visual es la **maqueta navegable** (`docs/drilldown-comunal/maqueta-drilldown-comunal.html` — ábrela en el browser): usa la geografía y los montos **reales** de Valparaíso, y todo lo violeta es lo nuevo.

## Qué se construye (en una frase)

Doble click en una región → el mapa enfoca la región y dibuja sus comunas delimitadas; el lateral pasa a lista de comunas con **n° de iniciativas e inversión (MM$)**; click en una comuna → el mismo detalle regional de siempre, filtrado a esa comuna. Breadcrumb Chile → Región → Comuna, con ← y Esc para volver.

## Lo que ya está resuelto y commiteado

1. **Geodata lista**: `public/comunas/{codregion}.geojson` (16 archivos, 3–51 KB c/u, simplificados y verificados). Se cargan **on-demand** al primer doble click y se cachean en memoria — el bundle y la carga inicial no cambian. Propiedades por feature: `cod_comuna` (CUT oficial — **siempre la llave, nunca el nombre**), `comuna`, `provincia`, `codregion` (mismo esquema numérico del `chile-regiones.geojson` actual).
2. **Matching comuna-texto → CUT resuelto al 100%**: el campo `comuna` es texto libre (había 811 variantes para 346 comunas: mayúsculas, tildes, encoding roto, listas multi-comuna). El análisis contra la base productiva completa está en `docs/drilldown-comunal/`:
   - `comuna_matching_full.csv` — cada valor → CUTs (insumo directo del backfill),
   - `alias_aplicados.csv` — la tabla de alias (typos, localidades, "La Calera"→Calera, etc.),
   - `reporte-matching-comunas.md` — el detalle del método y los números.
   Los 2 valores irresolubles ya se corrigieron a mano en la base (ids 10201 y 7492).

## Modelo de datos (migración nueva)

```sql
ALTER TABLE prioridades_territoriales
  ADD COLUMN comuna_cods INT[] NOT NULL DEFAULT '{}',
  ADD COLUMN alcance_regional BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_prioridades_comuna_cods
  ON prioridades_territoriales USING GIN (comuna_cods);
```

- `comuna` (texto) **no se toca** — sigue siendo lo que se muestra y lo que cargan las regiones. `comuna_cods` es derivado.
- Backfill one-shot desde `comuna_matching_full.csv`.
- El **matcher pasa a vivir en el importador** (`lib/comunas.ts` sugerido): normalizar (minúsculas, sin tildes, ñ→n, '¿'→'ñ') → alias → split (`, ; / -` y "y") → greedy por ventana para listas con espacios → fuzzy. Los valores que no matcheen se reportan en el preview del import, como ya se hace con otras columnas. Tests con los casos del CSV como fixtures.
- `alcance_regional = true` cuando el valor es "Regional/Varias/Todas/provincias/etc." o el campo viene vacío.

## Reglas de producto (cerradas con Diego — no re-abrir sin él)

1. **Visual**: comunas **delimitadas** (borde blanco), relleno = color de la región (`getRegionColor`), opacidad baja; hover resalta; seleccionada más intensa con borde oscuro. Sin semáforo por comuna en v1.
2. **Inversión visible — requisito clave**: cada fila de la lista comunal muestra `n iniciativas · MM$ X` (desde `inversion_mm`), y el header del detalle de comuna muestra el total. Tooltip del polígono: nombre + n + MM$.
3. **Multi-comuna**: una iniciativa con N comunas aparece **completa en cada una** (`comuna_cods @> {cut}`), monto incluido — **sin prorrateo**. Consecuencia asumida: la suma de las comunas ≠ total regional (se duplica lo compartido). El total regional correcto es el del nivel región; el subtítulo del panel lo advierte ("multi-comuna cuenta completa en cada una"). Si alguien pide que las columnas cuadren, es conversación de producto, no bug.
4. **Buckets al final de la lista**, en este orden: "**Alcance regional**" (iniciativas regionales/varias) y "**Sin comuna**" (campo vacío) como última fila, ambos con n y MM$. En Valparaíso son 25 (MM$ 53.588) y 104 (MM$ 772.601) — no pueden desaparecer del nivel comunal.
5. **Islas** (Isla de Pascua, Juan Fernández): aparecen en la lista con sus datos; fuera del encuadre del mapa (nota al pie, como en la maqueta).
6. Click simple en región **no cambia**: sigue abriendo el preview regional actual. En ese preview se agrega el acceso "Ver detalle comunal" (equivalente al doble click).

## Detalles técnicos que ya sabemos (para no descubrirlos debuggeando)

- **Leaflet + doble click**: desactivar `doubleClickZoom` en el MapContainer y distinguir click/dblclick con timer (~250 ms) en `onEachFeature`; si no, el doble click dispara dos selecciones de región antes del drill.
- Doble click → `map.flyToBounds(boundsRegión)` + fetch del geojson comunal + montar capa. Volver → remover capa y `fitBounds(CHILE_BOUNDS)`.
- El **estado de nivel** (nacional/regional/comunal + comuna activa) sube a `WorkOSApp`, junto a la región activa que ya existe, y se persiste en `localStorage` como la vista actual.
- Conteos y sumas por comuna se derivan **client-side** de las iniciativas ya cargadas (`comuna_cods` + `inversion_mm`) — no hace falta endpoint nuevo.
- El detalle de comuna **reusa el componente del panel regional** con el filtro por CUT — no es una vista nueva.

## Plan de PRs sugerido

| PR | Contenido |
|---|---|
| 1 | Migración + backfill + `lib/comunas.ts` (matcher) con tests |
| 2 | Matcher en el importador + no-matcheados en el preview de import |
| 3 | ChileMap: dblclick, fetch on-demand, capa comunal, estado de nivel |
| 4 | Panel lateral comunal (lista con n + MM$, buckets, detalle filtrado) |

## Criterios de aceptación

- [ ] Doble click en Valparaíso: comunas delimitadas, lista con los números de la maqueta (Valparaíso 88 · MM$ 249.222, Viña 62 · MM$ 542.235, buckets 25/104 al final).
- [ ] Click en San Antonio: detalle con sus 41 iniciativas y MM$ 387.827 en el header.
- [ ] Una iniciativa multi-comuna aparece en cada una de sus comunas.
- [ ] Click simple en región se comporta exactamente como hoy.
- [ ] Import con comuna nueva mal escrita → aparece en el preview como no-matcheada, no entra silenciosa.
- [ ] `npm run build` + `npm test` verdes.

Pendiente de decisión de producto (no bloquea): qué hacer con las iniciativas flageadas `OTRA REGIÓN` en el CSV (comuna que no pertenece a la región de la fila — ¿error de carga o cobertura real?). Están identificadas; Diego decide.

Cualquier duda, la maqueta es la fuente de verdad visual y el reporte tiene el detalle del matching. 🚀
