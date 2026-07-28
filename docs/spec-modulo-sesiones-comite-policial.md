# Spec — Módulo Sesiones (Comité Policial) en «Avance por Eje»

> **Estado:** propuesta validada con maqueta · julio 2026
> **Maqueta navegable:** `docs/maqueta-sesiones-comite-policial.html` (todo lo violeta es nuevo; el resto es UI existente)
> **Dueño de producto:** Diego (DCI) · Este doc es el insumo para planificar los PRs.

---

## 1. Qué se construye (resumen)

Las Delegaciones Presidenciales presiden semanalmente el **Comité Policial** (instancia de coordinación de seguridad con Carabineros, PDI, Gendarmería, Armada, etc.). Hoy esa instancia no deja registro estructurado: actas-punteo sin responsables ni plazos, sin trazabilidad de compromisos, sin series de datos.

Se agrega al PSG el concepto de **sesión** anclado a la sección *Avance por eje estratégico* de Mi Región:

- En el drawer de métricas de un eje con sesiones habilitadas (parte con **Seguridad**) aparece un botón **"Nueva sesión"** junto a "Nueva métrica".
- La sesión captura: verificación de compromisos anteriores → asistencia (nómina fija + invitados) → indicadores (precargados desde las métricas del eje) → apuntes libres por institución → compromisos nuevos.
- Al cerrar, los valores digitados **alimentan automáticamente las métricas del eje** (semántica suma o pulso), se genera el **acta estándar en PDF** y los compromisos quedan vivos para la sesión siguiente.
- Cada sesión guarda sus valores como filas propias → la **serie histórica** sale gratis.

Principio de diseño acordado: *flexibilidad sin deformar la estructura* — invitados no modifican la nómina fija, indicadores ad-hoc nacen tipados como métrica del eje, instituciones nuevas crean su bloque de apuntes al vuelo.

## 2. Alcance

**MVP (este spec):** sesiones en eje Seguridad para regiones piloto, flujo completo de la maqueta, acta PDF descargable, alimentación automática de métricas, historial con detalle.

**Fuera del MVP** (documentado para no re-discutir):
- Envío del acta por correo a la nómina (F2 — el MVP la deja descargable).
- Capa provincial (DPP). El modelo queda preparado (ver §4) pero no se implementa.
- Redacción del acta con IA (pulir apuntes con `lib/minutaAI`) — F2; el MVP genera el acta con los datos estructurados + apuntes tal cual.
- Reportes consolidados nacionales (mensual/trimestral) — son queries sobre estas tablas, se diseñan después.

## 3. Cambios a tablas existentes (migración `044_sesiones_eje.sql`)

### `region_ejes`
```sql
ALTER TABLE region_ejes
  ADD COLUMN sesiones_habilitadas BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN sesiones_nombre TEXT;  -- ej. 'Comité Policial'; label del módulo en UI
```
Activar sesiones = flag por (región, eje). Generaliza a futuro (Infraestructura, SEIA, Gabinete) sin tocar schema.

### `metricas_eje`
```sql
ALTER TABLE metricas_eje
  ADD COLUMN tipo TEXT NOT NULL DEFAULT 'suma' CHECK (tipo IN ('suma','pulso')),
  ADD COLUMN se_reporta_en_sesion BOOLEAN NOT NULL DEFAULT false;
```
- `tipo='suma'`: métrica con meta (comportamiento actual — barra de progreso). Cada sesión **incrementa** `valor_actual`.
- `tipo='pulso'`: foto semanal sin meta. Cada sesión **reemplaza** `valor_actual`; la card se renderiza con tendencia vs sesión anterior (ver §7), no con barra. `objetivo` queda sin uso para pulso — mantenerlo NOT NULL con 0 o relajar el check, a criterio del dev (documentar la decisión en el PR).
- `se_reporta_en_sesion=true`: la métrica aparece precargada en el formulario de indicadores de la sesión.
- Métricas existentes no cambian de comportamiento (default `suma` + `se_reporta_en_sesion=false`).

## 4. Tablas nuevas

Todas con `region_cod` denormalizado (patrón del repo) para RLS directa. `provincia_cod TEXT NULL` en `eje_sesiones` y `sesion_nomina` desde el día 1: hoy siempre NULL, habilita la capa provincial futura sin migración.

```sql
-- Sesión de la instancia
CREATE TABLE eje_sesiones (
  id BIGSERIAL PRIMARY KEY,
  region_cod TEXT NOT NULL,
  eje_id BIGINT NOT NULL REFERENCES region_ejes(id),
  provincia_cod TEXT,                    -- NULL = sesión regional
  fecha DATE NOT NULL,
  lugar TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','cerrada')),
  acta_path TEXT,                        -- path en bucket privado (ver §6)
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Nómina fija (titulares/suplentes designados por oficio; vigencia anual)
CREATE TABLE sesion_nomina (
  id BIGSERIAL PRIMARY KEY,
  region_cod TEXT NOT NULL,
  eje_id BIGINT NOT NULL REFERENCES region_ejes(id),
  provincia_cod TEXT,
  nombre TEXT NOT NULL,
  cargo TEXT,
  institucion TEXT NOT NULL,
  calidad TEXT NOT NULL DEFAULT 'titular' CHECK (calidad IN ('titular','suplente')),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asistencia por sesión: miembro de nómina O invitado (exactamente uno)
CREATE TABLE sesion_asistencia (
  id BIGSERIAL PRIMARY KEY,
  sesion_id BIGINT NOT NULL REFERENCES eje_sesiones(id) ON DELETE CASCADE,
  nomina_id BIGINT REFERENCES sesion_nomina(id),
  invitado_nombre TEXT,
  invitado_institucion TEXT,
  presente BOOLEAN NOT NULL DEFAULT true,
  CHECK (nomina_id IS NOT NULL OR invitado_nombre IS NOT NULL)
);

-- Valores de indicadores por sesión (la serie histórica vive aquí)
CREATE TABLE sesion_valores (
  id BIGSERIAL PRIMARY KEY,
  sesion_id BIGINT NOT NULL REFERENCES eje_sesiones(id) ON DELETE CASCADE,
  metrica_id BIGINT NOT NULL REFERENCES metricas_eje(id),
  valor NUMERIC NOT NULL,
  UNIQUE (sesion_id, metrica_id)
);

-- Apuntes libres por institución
CREATE TABLE sesion_apuntes (
  id BIGSERIAL PRIMARY KEY,
  sesion_id BIGINT NOT NULL REFERENCES eje_sesiones(id) ON DELETE CASCADE,
  institucion TEXT NOT NULL,
  texto TEXT NOT NULL DEFAULT ''
);

-- Compromisos (viven entre sesiones — no son hijos de una sola)
CREATE TABLE sesion_compromisos (
  id BIGSERIAL PRIMARY KEY,
  region_cod TEXT NOT NULL,
  eje_id BIGINT NOT NULL REFERENCES region_ejes(id),
  sesion_origen_id BIGINT NOT NULL REFERENCES eje_sesiones(id),
  descripcion TEXT NOT NULL,
  responsable_institucion TEXT NOT NULL,
  responsable_nombre TEXT,
  plazo DATE,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_curso','cumplido')),
  estado_updated_at TIMESTAMPTZ,
  estado_updated_by_email TEXT,
  cerrado_en_sesion_id BIGINT REFERENCES eje_sesiones(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Índices: `(region_cod, eje_id, fecha DESC)` en `eje_sesiones`; `(region_cod, eje_id, estado)` en `sesion_compromisos`; `(metrica_id, sesion_id)` en `sesion_valores`.

## 5. RLS — ⚠️ leer antes de codear

**Este módulo NO hereda el patrón SELECT world-readable** que el resto de las tablas tiene documentado como deuda en CLAUDE.md. Son datos de coordinación policial (nivel gestión, sin contenido de inteligencia — pero igualmente sensibles entre regiones).

Para las 6 tablas nuevas:

| Operación | admin / editor | regional | viewer |
|---|---|---|---|
| SELECT | todas las regiones | solo sus `region_cods` | **sin acceso** |
| INSERT/UPDATE | todas | solo sus `region_cods` | sin acceso |
| DELETE | admin/editor | no | no |

- Reusar `current_user_role()` (mig 023) y el patrón de chequeo de `region_cods` del trigger de `metricas_eje` (mig 023/026).
- Sesión con `estado='cerrada'` es inmutable: trigger que rechaza UPDATE/DELETE salvo rol admin (reapertura excepcional, queda en un log — puede ser un `sesion_log` simple o reusar patrón `semaforo_log`).
- **Storage**: bucket privado nuevo `comite-docs` para actas PDF, **con policies desde el día 1** (mismas reglas de la tabla; no repetir el caso `plan-regional`/`import-proposals` que quedaron sin policies). Servir acta vía URL firmada.

## 6. API

### `POST /api/sesiones` · `PATCH /api/sesiones/[id]`
Crear/guardar borrador. Alternativa aceptable: escrituras de borrador directas desde el cliente con `safeWrite`/`lib/dbWrite.ts` (patrón optimistic + revert + `window.alert`). El borrador se puede guardar parcial N veces.

### `POST /api/sesiones/[id]/cerrar` — el paso crítico, server-side siempre
Route handler con `requireAuth` + zod (`lib/schemas`) + `getSupabaseAdmin()`. En orden:

1. Validar estado `borrador` y pertenencia región/eje del usuario.
2. Upsert de `sesion_valores`.
3. **Actualizar métricas**: para cada valor, si `tipo='suma'` → `valor_actual = valor_actual + valor`; si `tipo='pulso'` → `valor_actual = valor`. Actualizar `valor_updated_*`. (Hacerlo aquí y no en trigger SQL mantiene la lógica en TS testeable — decisión sugerida, no impuesta.)
4. Marcar compromisos verificados (estados nuevos + `cerrado_en_sesion_id` para los cumplidos).
5. Generar acta PDF con `@react-pdf/renderer` (patrón de `app/api/minuta/route.ts`; `registerPdfFonts`). Estructura del acta = metodología estándar DCI: antecedentes / asistencia / indicadores / temas por institución / compromisos (nuevos + estado de anteriores). Subir a `comite-docs`, guardar `acta_path`.
6. `estado='cerrada'`, `closed_at=NOW()`.

Idempotencia: si el paso 5 falla tras el 3, no debe poder re-ejecutarse la suma (guardar un flag `metricas_aplicadas` o aplicar métricas y cierre en la misma transacción vía RPC — a criterio del dev; documentar en el PR).

## 7. UI

### `MetricasEjeDrawer.tsx` (modificar)
- Si `eje.sesiones_habilitadas`: botón **"Nueva sesión"** junto a "Nueva métrica" (visible para `canEditOperational`; "Nueva métrica" sigue `canEditAny`), strip con `N compromisos abiertos · última sesión dd-mmm`, y footer "Sesiones de {sesiones_nombre}" + **"Ver historial →"** (abre modal; el listado NO va inline en el drawer).
- `MetricaCard`: tag visual si `se_reporta_en_sesion` (SUMA/PULSO). Card pulso: sin barra de progreso — valor grande + Δ% vs sesión anterior + sparkline (datos de `sesion_valores`).
- Métricas con `se_reporta_en_sesion=true`: bloquear edición inline de `valor_actual` (el valor entra por sesión; evita doble conteo en las suma).

### `SesionModal.tsx` (nuevo)
Modal grande, 5 zonas en este orden (el orden es producto, no estética):
1. **Compromisos anteriores** — botones de estado (cumplido/en curso/pendiente). Es lo primero que se ve.
2. **Asistencia** — checkboxes sobre nómina activa + "agregar invitado" (filas `INV`, no tocan `sesion_nomina`).
3. **Indicadores** — filas precargadas (métricas `se_reporta_en_sesion`), muestra valor de la sesión anterior como referencia y a qué métrica alimenta. "+ indicador no contemplado" crea métrica nueva (pide tipo) con `se_reporta_en_sesion=true`.
4. **Apuntes por institución** — tabs con textarea; "+ institución" agrega tab (persiste como institución sugerida en próximas sesiones de esa región).
5. **Compromisos nuevos** — descripción / responsable / plazo.
Footer: "Guardar borrador" / "Cerrar sesión y generar acta".

### `HistorialSesionesModal.tsx` (nuevo)
Lista de sesiones (fecha, n° asistentes, n° compromisos, estado acta); click expande detalle (asistencia, valores, compromisos con estado, descarga de acta vía URL firmada).

### Gestión de nómina
Pantalla mínima (o sección en el drawer, admin/editor + regional de la región): CRUD de `sesion_nomina`. Sin esto el piloto no puede partir — no dejarlo para el final.

## 8. Reglas de negocio (resumen para tests)

1. Cerrar sesión con métrica suma: `valor_actual += valor`; con pulso: `valor_actual = valor`.
2. Un compromiso creado en la sesión N aparece en la zona 1 de la sesión N+1 (y N+2… mientras no esté `cumplido`).
3. Invitado en asistencia no crea filas en `sesion_nomina`.
4. Indicador ad-hoc en sesión = métrica nueva del eje con tipo elegido; queda precargada en la sesión siguiente.
5. Sesión cerrada: inmutable para no-admin; el acta no se regenera al cambiar métricas después.
6. Sparkline/serie y "valor sesión anterior" leen de `sesion_valores`, nunca de `valor_actual`.
7. Región sin flag `sesiones_habilitadas`: el drawer se ve exactamente como hoy (cero regresión).

Tests (vitest, criterio del repo: "buscar dolor, no cobertura"): helper de agregación suma/pulso, query de compromisos abiertos, guard de idempotencia del cierre.

## 9. Plan de PRs propuesto

| PR | Contenido | Depende de |
|---|---|---|
| **PR-1** | Migración 044 completa (tablas + RLS + bucket) + types en `lib/types.ts` + schemas zod | — |
| **PR-2** | Drawer: flag, botón, tags, strip; `SesionModal` con guardar borrador; gestión de nómina | PR-1 |
| **PR-3** | `POST /cerrar`: métricas + acta PDF + inmutabilidad | PR-1 |
| **PR-4** | Historial + card pulso (sparkline/tendencia) + pulido | PR-2, PR-3 |

Piloto sugerido: habilitar flag solo en 2-3 regiones (dato, no deploy — es un UPDATE a `region_ejes`).

## 10. Criterios de aceptación E2E

- [ ] Usuario regional de Valparaíso crea sesión, marca asistencia, digita 5 indicadores, agrega 1 compromiso, cierra → acta PDF descargable; métricas del eje reflejan suma/pulso correctamente.
- [ ] La sesión siguiente muestra ese compromiso en zona 1 y el valor anterior como referencia en indicadores.
- [ ] Usuario regional de OTRA región no ve nada de Valparaíso (sesiones, compromisos, actas). Viewer no ve el módulo.
- [ ] Región sin flag: drawer idéntico al actual.
- [ ] Cerrar dos veces la misma sesión no duplica sumas.
- [ ] `npm run build` + `npm test` verdes.

## 11. Decisiones abiertas (no bloquean PR-1)

- Envío del acta por email a la nómina (F2) — ¿desde el server con qué servicio?
- Pulir apuntes con IA al generar acta (F2) — reusar `lib/minutaAI`.
- ¿`viewer` debería tener algún acceso de lectura agregada (sin detalle)? Por ahora: no.
- Semántica de reapertura de sesión (admin): ¿revierte métricas o solo permite editar apuntes? Propuesta: solo apuntes/asistencia; valores y compromisos exigen nota en log.
