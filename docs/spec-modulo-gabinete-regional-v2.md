# Spec — Módulo Gabinete Regional v2 (pauta, sesión y acta)

> **Estado:** arquitectura aprobada por dev (ago-2026) · correcciones 1–5 incorporadas · decisión del pool CERRADA (§3)
> **Dueño de producto:** Diego (DCI) · **Insumo de diseño:** `entregables/Propuesta_Gabinete_Regional_v5_con_mockups.docx` (mockups y racional de cada pantalla; este spec manda cuando difieran).
> **Contexto previo obligatorio:** `docs/spec-modulo-gabinete-regional.md` (v1), migs `044`, `046`, `053/054/057`, `070`, y `app/api/sesiones/[id]/cerrar/route.ts`. Este spec **evoluciona** el módulo v1, no lo reemplaza de golpe: los comités (`eje`, `infraestructura`, `politico`) no se tocan.

---

## 1. Qué cambia y por qué (resumen)

El módulo v1 captura la sesión en tres listas que no se conversan (temas / apuntes por institución / compromisos). El acta real de Los Ríos demostró que la reunión corre por **temas** con relato, intervenciones y compromisos colgando de cada uno. La v2 hace del **punto de pauta** la columna vertebral:

- **ANTES**: preparación paso a paso (pendientes → pauta → revisar y enviar), con puntos que llevan pregunta, responsables múltiples e **iniciativas del PREGO vinculadas**. Hoja de conducción PDF de 2 caras.
- **DURANTE**: captura por tema — relato general + **intervenciones atribuidas por cartera** + compromisos que nacen del tema + "Tema listo ✓" (con ofrecimiento de actualizar avance de las iniciativas vinculadas).
- **DESPUÉS**: cierre en 4 movimientos (pendientes / compromisos de hoy con plazos / **vocerías de la semana** / anotados) + **previsualizar acta** → acta v2 ordenada por la pauta, con puntos incorporados en sesión continuando la numeración.
- **PREGO**: al cerrar, el bloque del tema (relato + intervenciones + compromisos) queda visible en la pestaña Seguimiento de cada iniciativa vinculada ("Tratado en Gabinete N° X") — leyendo por el vínculo, sin copiar datos.

Fuera de alcance (decidido en rondas 4–5): vistas móviles, proyección, realtime multi-superficie, cronómetros. Una superficie: el panel; un papel: la hoja de conducción.

## 2. Correcciones del dev — incorporadas (no re-discutir)

| # | Corrección | Cómo queda en este spec |
|---|---|---|
| 1 | `sesion_apuntes` no admite intervenciones (`institucion NOT NULL` + `UNIQUE(sesion_id, institucion)`) | Tabla nueva `sesion_intervenciones` (§4.3). `sesion_apuntes` y la sección VI del acta v1 quedan intactas para sesiones históricas y para los comités |
| 2 | `sesion_compromisos.estado` ya existe (pendiente/en_curso/cumplido) | Columna nueva **`confirmado BOOLEAN NOT NULL DEFAULT true`** (§4.4). Default `true` = todo lo legado y lo de comités queda confirmado; solo la consola de gabinete crea borradores con `false` |
| 3 | RLS + triggers obligatorios en tablas nuevas; `gabinete_temas`/`eje_sesiones` fuera de la 070 | §5 completo: patrón `can_operar_sesion` para las hijas de sesión, política propia para `gabinete_temas` (que deja de tener filas sin sesión, §3), trigger de inmutabilidad tras cierre en todas las hijas nuevas. Va **en PR-1** |
| 4 | `SesionModal` sirve a 3 instancias; `AttentionTray`/`TemasGabinetePanel` compartidos | Plan de **coexistencia** (§7): fase 1 no toca el modal salvo un cambio mínimo de captura; la consola es fase 2 detrás de flag; nada se borra hasta validar con actas reales |
| 5 | Secuencia: slice de bajo riesgo primero | Plan de PRs (§9) reordenado según la recomendación del dev |

## 3. LA DECISIÓN (cerrada): se jubila el pool / `fijo` / copia-al-cierre

**Decisión:** los temas dejan de vivir en un pool regional (`sesion_id NULL`) que se archiva al cierre. En v2 **todo punto de pauta nace perteneciendo a una sesión** (`sesion_id NOT NULL` para filas nuevas, validado en app y zod; la columna sigue nullable por las filas históricas). El mecanismo `fijo` + copia-al-cierre (`cerrar/route.ts:203-238`) **se elimina para gabinete** y se reemplaza por:

- **`gabinete_recurrentes`** (tabla nueva, por región): la plantilla de puntos que se repiten (PSG, probidad, agenda de visitas…). Al crear la pauta (paso 2 de Preparación), se insertan automáticamente como puntos borrador de ESA sesión. `gabinete_temas.recurrente_id` (nullable) conserva la trazabilidad de la serie.
- **Precarga por `origen`**: pospuestos y anotados de la sesión anterior entran a la nueva pauta como puntos borrador con su `origen` (`pospuesto`/`anotado`), creados en el paso 1 de Preparación.

Con esto, `compromiso.tema_id`, `sesion_intervenciones.tema_id` y `gabinete_tema_iniciativas.tema_id` apuntan siempre al tema de su sesión: **ningún link se rompe al cerrar** (la incompatibilidad que levantó el dev desaparece de raíz, no se parcha).

**Migración de datos (en PR-1, idempotente):**
1. Pool actual `fijo=true` y `sesion_id NULL` → insertar en `gabinete_recurrentes` (texto, subitems como detalle) y borrar del pool.
2. Pool actual `fijo=false` y `sesion_id NULL` (pendientes sin archivar) → conservar tal cual; el paso 1 de Preparación los ofrece una única vez como "puntos sin sesión (legado)" para llevarlos a la primera pauta v2; los no llevados se archivan a esa sesión al cerrarla (última vez que corre esa lógica).
3. Filas archivadas (`sesion_id` set) → intactas; las actas históricas renderizan v1 sin cambios.
4. El bloque de copia de fijos del route de cierre se elimina para gabinete en el mismo PR que activa la Preparación v2 (PR-2), no antes — mientras tanto convive.

## 4. Modelo de datos (migración `07x_gabinete_v2.sql`, todo `IF NOT EXISTS`)

### 4.1 `eje_sesiones`
```sql
ADD COLUMN IF NOT EXISTS pauta_enviada_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS numero INT,              -- estampado al cerrar; correlativo estable
ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'panel' CHECK (origen IN ('panel','historica'));
```
Estados operativos (columna `estado` existente no cambia su dominio borrador/cerrada; la fase de pauta se deriva: `pauta_enviada_at IS NULL` = preparando, set = enviada). No introducir un enum nuevo de estados: menos migración, misma semántica.

### 4.2 `gabinete_temas` (el punto de pauta)
```sql
ADD COLUMN IF NOT EXISTS titulo TEXT,             -- v1 usaba `texto`; se mantiene texto como detalle
ADD COLUMN IF NOT EXISTS proposito TEXT,          -- "la pregunta"; NOT NULL solo vía zod para origen de pauta
ADD COLUMN IF NOT EXISTS minutos INT NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'manual'
  CHECK (origen IN ('manual','pospuesto','anotado','sugerido','recurrente','en_sala','legado')),
ADD COLUMN IF NOT EXISTS recurrente_id BIGINT REFERENCES gabinete_recurrentes(id),
ADD COLUMN IF NOT EXISTS estado_cierre TEXT
  CHECK (estado_cierre IN ('tratado','sin_novedades','pospuesto','retirado'));
```
`fijo` queda deprecado (no se borra la columna; deja de escribirse). Regla app/zod: filas nuevas exigen `sesion_id NOT NULL` + `proposito` no vacío salvo `origen='en_sala'`.

### 4.3 Tablas nuevas
```sql
CREATE TABLE IF NOT EXISTS gabinete_recurrentes (
  id BIGSERIAL PRIMARY KEY,
  region_cod TEXT NOT NULL,
  titulo TEXT NOT NULL,
  detalle TEXT,
  proposito_plantilla TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gabinete_tema_carteras (   -- responsables múltiples
  tema_id BIGINT NOT NULL REFERENCES gabinete_temas(id) ON DELETE CASCADE,
  institucion TEXT NOT NULL,                          -- catálogo canónico de 22 en lib/ (constante + normalizador + test)
  orden INT NOT NULL DEFAULT 1,                       -- orden=1 es la principal
  PRIMARY KEY (tema_id, institucion)
);

CREATE TABLE IF NOT EXISTS gabinete_tema_iniciativas ( -- vínculo PREGO, N:N, llave estable id (NUNCA n)
  tema_id BIGINT NOT NULL REFERENCES gabinete_temas(id) ON DELETE CASCADE,
  prioridad_id BIGINT NOT NULL REFERENCES prioridades_territoriales(id),
  PRIMARY KEY (tema_id, prioridad_id)
);

CREATE TABLE IF NOT EXISTS sesion_intervenciones (    -- corrección 1 del dev
  id BIGSERIAL PRIMARY KEY,
  sesion_id BIGINT NOT NULL REFERENCES eje_sesiones(id) ON DELETE CASCADE,
  tema_id BIGINT NOT NULL REFERENCES gabinete_temas(id) ON DELETE CASCADE,
  institucion TEXT,                                   -- NULL = relato general del tema
  texto TEXT NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  created_by_email TEXT
);
-- Sin UNIQUE por institución: una cartera puede intervenir en N temas y N veces.

CREATE TABLE IF NOT EXISTS sesion_vocerias (
  id BIGSERIAL PRIMARY KEY,
  sesion_id BIGINT NOT NULL REFERENCES eje_sesiones(id) ON DELETE CASCADE,
  dia TEXT NOT NULL,
  vocero TEXT NOT NULL,
  tema_texto TEXT NOT NULL
);
```
El relato general vive en `sesion_intervenciones` con `institucion NULL` (no en `sesion_apuntes`): una sola tabla para todo el contenido por tema. `sesion_apuntes` queda congelada para históricos y comités.

### 4.4 `sesion_compromisos`
```sql
ADD COLUMN IF NOT EXISTS tema_id BIGINT REFERENCES gabinete_temas(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS confirmado BOOLEAN NOT NULL DEFAULT true,   -- corrección 2: NO tocar `estado`
ADD COLUMN IF NOT EXISTS plazo_tipo TEXT NOT NULL DEFAULT 'fecha'
  CHECK (plazo_tipo IN ('fecha','permanente','por_definir')),
ADD COLUMN IF NOT EXISTS responsable_todas BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS verificado_en_sala_sesion_id BIGINT REFERENCES eje_sesiones(id);
```
Semántica: `confirmado=false` solo lo crea la captura de gabinete; el cierre exige confirmarlos o descartarlos (borrar). Solo `confirmado=true` entra a acta y zona de verificación. `prioridad_id` (existente) se precarga desde `gabinete_tema_iniciativas` (selector de un paso si el tema tiene varias).

## 5. RLS y triggers (corrección 3 — va completo en PR-1)

- `sesion_intervenciones`, `sesion_vocerias`: patrón mig 070 exacto — `can_operar_sesion(sesion_id)` para SELECT/INSERT/UPDATE, DELETE solo con sesión en borrador. RLS ENABLE + FORCE.
- `gabinete_tema_carteras`, `gabinete_tema_iniciativas`: heredan vía join al tema — políticas `can_operar_sesion((SELECT sesion_id FROM gabinete_temas t WHERE t.id = tema_id))`.
- `gabinete_temas`: **se cierra el hoyo de la 053** (`select_any USING (true)` era world-readable). Nuevas políticas: SELECT/INSERT/UPDATE por `can_operar_sesion(sesion_id)`; para las filas legado con `sesion_id NULL`, SELECT/UPDATE solo por rol regional de la región o admin/editor (política transitoria, se elimina cuando la migración §3.2 termine). `gabinete_recurrentes`: mismas capacidades por región.
- `eje_sesiones`: sumar a la RLS-por-capacidad de la 070 (el dev lo pidió: "aprovechar para cerrarlo").
- **Inmutabilidad**: extender el trigger `sesion_hijas_bloquea_cerrada` (o crear equivalente) a `sesion_intervenciones`, `sesion_vocerias`, `gabinete_tema_carteras`, `gabinete_tema_iniciativas` y a los UPDATE de `gabinete_temas` cuya sesión esté `cerrada`. Excepción única: el propio route de cierre (service role).

## 6. API

- `POST/PATCH /api/sesiones` — acepta los campos nuevos de pauta (zod refleja los CHECK; `en_sala` exime `proposito`).
- `POST /api/sesiones/[id]/enviar-pauta` — valida (todas las preguntas, ≤12 puntos, anotados resueltos), setea `pauta_enviada_at`, genera hoja de conducción (2 caras, patrón `CronogramaGabinetePdf` evolucionado) y la sube al bucket.
- `POST /api/sesiones/[id]/cerrar` — bifurcación gabinete v2: exige borradores resueltos + `estado_cierre` en todo tema + carteras resueltas; estampa `numero`; **ya no copia fijos ni archiva pool** (§3); snapshot de iniciativas igual que v1; genera acta v2.
- `GET /api/sesiones/[id]/acta/preview` — ya existe (`opts.preview`); el render v2 agrega marca de agua BORRADOR. El botón "Previsualizar acta" del cierre lo consume.
- Ficha de iniciativa (`SeguimientoTab`): query por `gabinete_tema_iniciativas` → "Tratado en Gabinete N° X" con relato + intervenciones + compromisos del tema (read-only, sin copiar datos).

## 7. UI — dos fases (corrección 4: coexistencia, no borrado)

**Fase 1 — slice de bajo riesgo (el pedido original completo, sin consola):**
1. **Preparación paso a paso** (nueva página, reemplaza `TemasGabinetePanel` solo para gabinete): stepper Pendientes → Pauta → Revisar y enviar, según mockups v5. `AttentionTray` sigue intacto (en foco / sugerencias alimentan el paso 2).
2. **Captura mínima en `SesionModal`** (cambio quirúrgico, mismas 5 zonas): la zona 4 de apuntes, en modo gabinete, escribe en `sesion_intervenciones` con un select de tema arriba (tema activo + institución de la pestaña); la zona 5 gana el select "Tema" (default: el último usado). Nada más se toca; `eje`/`infraestructura` cero regresión.
3. **Acta v2** (`ActaGabinetePdf` + `generarActaGabinete`): ordenada por pauta, bloque por tema (título → pregunta en cursiva → relato → intervenciones por cartera → compromisos con correlativo S[N]-C[n]), incorporados al final continuando la numeración, vocerías, consolidado, permanentes. Sesiones históricas renderizan v1 (switch por presencia de pauta v2).
4. **Cierre en 4 movimientos** + previsualización.

**Fase 2 — consola de sesión** (mockups v5): rail + tarjeta de tema (relato / intervenciones / iniciativas / Tema listo ✓ / + Punto). Detrás de `region_config` flag, convive con el modal; se decide el reemplazo tras 3–4 actas reales del piloto.

## 8. Reglas de negocio (para tests — criterio del repo: dolor, no cobertura)

1. Tema nuevo de pauta sin `proposito` → zod 400 (salvo `en_sala`). Tema 13+ creado en sala continúa la numeración y sale como "Incorporado en sesión".
2. Cerrar con borradores (`confirmado=false`) o temas sin `estado_cierre` → 409 con detalle. Cerrar dos veces no duplica (claim atómico existente).
3. Compromiso confirmado con `tema_id` y `prioridad_id` aparece: en el acta bajo su tema, en el cuadro consolidado, y en el Seguimiento de la iniciativa. Jamás por `n`.
4. Recurrente activo → aparece como punto borrador al crear cada pauta nueva; su `tema_id` es distinto cada semana; los compromisos cuelgan del tema de SU semana.
5. Viewer: sin acceso a nada del módulo (incluidas las tablas nuevas — test RLS con el patrón de `permissions.test.ts`). Regional de otra región ídem.
6. Sesión cerrada: INSERT/UPDATE en cualquier hija → bloqueado por trigger (test).
7. Comités: suite completa actual verde sin cambios (regresión cero — el test más importante del PR-1).

## 9. Plan de PRs (secuencia del dev)

| PR | Contenido | Riesgo |
|---|---|---|
| **PR-1** | Migración completa §4 + RLS/triggers §5 + migración de datos §3 + types/zod + tests RLS y de regresión de comités | Bajo (aditivo) — **ventana de nacimiento: cuanto antes** |
| **PR-2** | Preparación paso a paso + `enviar-pauta` + hoja de conducción + retiro de la copia-de-fijos del cierre | Medio |
| **PR-3** | Captura mínima en `SesionModal` (intervenciones + tema en compromisos) + Acta v2 + cierre en 4 movimientos + previsualización + Seguimiento en ficha de iniciativa | Medio |
| **PR-4** | Señal DCI (pauta enviada en plazo, cerrada en plazo, vencidos, % carteras que actualizaron) + carga histórica (`origen='historica'`, `numero` explícito, `acta_path` al Word real) | Bajo |
| **PR-5** | **Fase 2**: consola de sesión tras validar con 3–4 actas reales del piloto | Alto (por eso va última) |

## 10. Criterios de aceptación E2E (fase 1)

- [ ] Equipo DPR de Los Ríos: prepara pauta en 3 pasos (2 pendientes llevados, 6 puntos con pregunta, 1 con 2 carteras, 2 con iniciativa vinculada), envía → hoja de conducción de 2 caras descargable; seremis la reciben.
- [ ] En sesión (modal actual): registra relato + 2 intervenciones atribuidas en un tema, 1 compromiso con tema e iniciativa; crea 1 tema en sala.
- [ ] Cierre: resuelve borradores, fija plazos en la lectura, registra 2 vocerías, previsualiza, genera acta → PDF ordenado por pauta con el incorporado al final y vocerías; `metricas_eje` intacta.
- [ ] La ficha de la iniciativa vinculada muestra "Tratado en Gabinete N° X" con el bloque del tema.
- [ ] Semana siguiente: el recurrente reaparece, el pospuesto se reinserta, el compromiso abierto se cobra; ningún link roto.
- [ ] Viewer/otra región: nada visible. Comités: cero regresión. `npm run build` + `npm test` verdes.
