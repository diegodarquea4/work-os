# Drill-down comunal en Mapa — Reporte de datos y plan

> Insumo para el desarrollo del doble click región → comunas en la vista Mapa del PSG.
> Generado: 28-jul-2026 · Fuente: base productiva (7.315 iniciativas) + GeoJSON DPA comunal (346 comunas).

## 1. Decisiones de producto (validadas con Diego)

1. **Visual comunal:** las comunas se muestran **delimitadas** (borde), manteniendo como relleno el color de la región (`getRegionColor`). Sin semáforo ni heatmap por comuna en v1.
2. **Multi-comuna:** una iniciativa con N comunas aparece en las N comunas (relación vía arreglo `comuna_cods`).
3. **Alcance regional:** las iniciativas "Regional/Varias/Todas/sin comuna" van a una fila-bucket **"Alcance regional"** en el panel comunal — son ~24% de la base y no pueden desaparecer del nivel comunal.
4. Doble click sobre región (en mapa o estando en su detalle) → enfoca la región + dibuja comunas + lista de comunas en el lateral; click en comuna → detalle tipo regional filtrado a esa comuna.

## 2. Resultado del matching (base real, no muestra)

De las **7.315** iniciativas: **1.298 (17,7%)** no tienen valor en `comuna` → bucket regional directo. Las **6.016 restantes** tenían **704 valores distintos de texto libre**, que el matcher resuelve así:

| Categoría | Iniciativas | % | Qué es |
|---|---|---|---|
| Match directo | 5.117 | 85,1% | El texto es la comuna (tras normalizar mayúsculas/tildes) |
| Match con alias / fuzzy | 229 | 3,8% | Typos, encoding roto (¿→ñ), abreviaturas, localidades |
| Multi-comuna completo | 211 | 3,5% | Listas separadas por , ; / - o espacios — todas resueltas |
| Multi-comuna parcial | 2 | 0,03% | Lista resuelta salvo una parte |
| Bucket regional | 456 | 7,6% | "Regional", "Varias", provincias, "por definir", exclusiones |
| **Sin match** | **3** | **0,05%** | 2 valores ambiguos → corrección manual |

**Conclusión: el matching es un problema resuelto.** No se requiere jornada de limpieza manual: solo 2 valores (3 iniciativas) necesitan decisión humana (`comuna_sin_match.csv`). La tabla de alias aplicados está en `alias_aplicados.csv` y el detalle completo valor→comunas en `comuna_matching_full.csv`.

Notas relevantes del matching para el dev:

- **Nombres oficiales que difieren del uso común** (el catálogo manda): `Calera` (no "La Calera"), `Llaillay`, `San Vicente` (no "de Tagua Tagua"), `Natales`, `Cabo de Hornos` (incluye "Antártica").
- **Localidades mapeadas a su comuna:** Liquiñe→Panguipulli, Lican Ray→Villarrica, Dichato→Tomé.
- **Cross-región detectado y flageado** (ej. "Alto Hospicio" en Antofagasta, "Penco" en Ñuble): quedan matcheadas con nota `OTRA REGIÓN` en el CSV — decidir si son error de carga o cobertura real.
- El matcher vive en `docs/drilldown-comunal/` como referencia; la versión productiva debe implementarse como parte del importador (misma lógica: normalizar → alias → split → greedy → fuzzy).

## 3. Geodata entregada

`public/comunas/{codregion}.geojson` — 16 archivos, **uno por región, carga on-demand al hacer doble click** (no se toca el bundle ni la carga inicial del mapa).

- Fuente: DPA oficial (repo fcortes/Chile-GeoJSON), 345 comunas (se omitió "Zona sin demarcar").
- Propiedades por feature: `cod_comuna` (CUT oficial — **la llave**), `comuna`, `provincia`, `codregion`.
- Simplificados con mapshaper (Visvalingam 8%, keep-shapes) las regiones costeras pesadas: todos los archivos quedaron entre **3 y 51 KB** (total 277 KB). Integridad verificada: 0 geometrías vacías, conteos correctos por región.
- `codregion` numérico coincide con el `codregion` del `chile-regiones.geojson` ya en uso. El `cod` romano de la app (I…XVI, RM) se mapea con lo existente en `lib/regions.ts`.

## 4. Cambios de datos propuestos (migración)

```sql
ALTER TABLE prioridades_territoriales
  ADD COLUMN comuna_cods INT[] NOT NULL DEFAULT '{}',   -- CUTs matcheados
  ADD COLUMN alcance_regional BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_prioridades_comuna_cods ON prioridades_territoriales USING GIN (comuna_cods);
```

- `comuna` (texto original) **no se toca** — sigue siendo lo que se muestra y lo que cargan las regiones.
- Backfill one-shot con el resultado del matching (`comuna_matching_full.csv` trae valor→CUTs listo para generar el UPDATE).
- El **importador** aplica el matcher en cada carga futura (y reporta en el preview los valores que no matchean, como ya hace con otras columnas).
- `alcance_regional = true` para bucket regional y sin comuna.

## 5. Interacción (para la spec de componentes)

- **Leaflet + doble click:** desactivar `doubleClickZoom` del MapContainer y distinguir click de dblclick con timer (~250 ms) en `onEachFeature` — si no, cada doble click dispara dos selecciones de región.
- Doble click región → `map.flyToBounds(region)` + fetch `public/comunas/{codregion}.geojson` (cache en memoria) + capa comunal (relleno color región, opacidad baja, borde blanco; hover resalta; tooltip nombre + n° iniciativas).
- Lateral en modo comunal: lista de comunas ordenada por n° de iniciativas + fila fija "Alcance regional (N)". Click comuna (en mapa o lista) → mismo componente de detalle regional filtrado por `comuna_cods @> {cut}`.
- Salida: botón "← Región" y "← Chile"; Escape restaura nivel anterior. El estado de nivel (nacional/regional/comunal) se agrega al estado global de `WorkOSApp` para que sobreviva el cambio de vista, igual que la región activa hoy.
- Conteos por comuna: derivables client-side de las iniciativas ya cargadas (`comuna_cods`), sin endpoint nuevo.

## 6. Plan de PRs sugerido

| PR | Contenido |
|---|---|
| **PR-1** | Migración `comuna_cods` + backfill desde matching + matcher en `lib/comunas.ts` con tests (casos del CSV como fixtures) |
| **PR-2** | Matcher integrado al importador + reporte de no-matcheados en el preview de import |
| **PR-3** | Capa comunal en ChileMap (dblclick, fetch on-demand, estilos) + estado de nivel en WorkOSApp |
| **PR-4** | Panel lateral comunal (lista + bucket regional + detalle filtrado) |

Pendiente de decisión (no bloquea): qué hacer con los flags `OTRA REGIÓN` (¿corrección de datos o cobertura legítima?) y los 2 valores sin match.
