# Prompt — Consolidación de backend Work OS (PSG)

> **Cómo usar este documento:** pégalo completo como instrucción inicial a tu agente dev (Claude Code) desde la raíz del repo `work-os`. Está diseñado para ejecutarse en etapas, con puntos de control donde el agente debe detenerse y pedir confirmación.

---

## Rol y misión

Eres un ingeniero senior trabajando sobre **Work OS**, un panel Next.js 16 + Supabase del Ministerio del Interior de Chile (63 prioridades territoriales, 16 regiones, ~36K LOC). Existe una auditoría técnica completa en `docs/auditoria-tecnica-2026-06.md` — **léela antes de escribir una sola línea**, junto con `CLAUDE.md` y `AGENTS.md`.

Tu misión: ejecutar el plan de consolidación de backend de esa auditoría. El usuario final **no debe notar absolutamente nada**: ni un pixel, ni un flujo, ni un texto distinto. Todo el valor de este trabajo es invisible — seguridad, integridad de datos, confiabilidad.

## Restricciones duras (no negociables)

1. **Cero cambios visuales.** No tocar estilos, layouts, textos, componentes de presentación, ni agregar elementos de UI nuevos (nada de toasts nuevos, spinners nuevos, etc.). Si un fix necesita avisar un error al usuario, usa el mecanismo que ya existe en ese componente (`window.alert` donde ya se usa, o el estado de error existente). La modernización de UX de errores queda explícitamente fuera de alcance.
2. **Cero cambios funcionales.** Lo que cada rol (admin/editor/regional/viewer) puede hacer HOY desde la interfaz debe poder hacerlo exactamente igual mañana. La regla de oro para las políticas de seguridad es **"espejar la UI"**: la base debe permitir exactamente lo que la interfaz permite hoy, y negar lo que la interfaz esconde hoy. Nada más, nada menos.
3. **Nada destructivo sin confirmación.** No borrar tablas, columnas ni datos. No desactivar escrituras v1. No rotar llaves. Cualquier paso irreversible: detenerse, explicar, y esperar OK explícito del usuario.
4. **Migraciones SQL:** archivos nuevos en `supabase/migrations/` continuando la numeración (`023_...` en adelante), idempotentes (`DROP POLICY IF EXISTS` + `CREATE`, `IF NOT EXISTS`), con comentario de contexto arriba como las existentes. El agente NO aplica migraciones a producción: las deja listas y entrega al usuario el SQL para correr en *Supabase → SQL Editor*, con su query de verificación post-aplicación.
5. **Secretos:** jamás imprimir valores de `.env.local` en salidas, commits o logs. `.env*` sigue fuera de git.
6. **Validación:** `npm run build` debe pasar al final de CADA etapa. No hay suite de tests previa (la crearás en la Etapa 7).
7. **Git:** una rama por etapa (`consolidacion/etapa-N-nombre`), commits atómicos con mensajes descriptivos en español como los del historial. Al final de cada etapa: resumen de qué cambió, qué hay que verificar a mano, y detenerse.
8. **Convenciones del repo que ya existen y se respetan:** dos clientes Supabase (`lib/supabase.ts` browser / `lib/supabaseServer.ts` solo en `app/api/**`), `region_id === undefined` (nunca `!regionId`, el 0 es válido), Tailwind v4 sin config JS, fechas BCCh `DD-MM-YYYY`.

---

## Etapa 0 — Diagnóstico en vivo (solo lectura, sin commits)

Antes de cambiar nada, confirma el estado real de la base. Corre (o entrega al usuario para correr) las consultas del **Apéndice A** de `docs/auditoria-tecnica-2026-06.md`. Como mínimo necesitas:

- El volcado completo de `pg_policies` (qué políticas existen HOY, tal cual).
- Si RLS está habilitado o no en cada tabla (`pg_class.relrowsecurity`) — ojo especial con las tablas v1 que no tienen migración en el repo: `prioridades_territoriales`, `user_profiles`, `prego_monitoreo`, `region_metrics`, `regional_metrics`, `semaforo_log`, `stop_stats`.
- Conteos v1 vs v2 (`seia_projects` vs `v2_proyectos_inversion`, etc.).
- `sync_status` completo.
- Esquema real de `user_profiles` y de `prioridades_territoriales` (columnas, PK, unicidad de `id` y de `n`).

**Entregable:** un reporte corto en `docs/diagnostico-en-vivo-<fecha>.md` con los resultados y cualquier sorpresa respecto a lo que asume la auditoría. Si algo contradice las suposiciones de las etapas siguientes (p. ej. ya existe una política por rol, o `user_profiles` tiene RLS que rompería el patrón propuesto), ajusta el plan y explícalo antes de seguir.

**Además, en esta etapa:** reconstruye el **esquema completo como código**. Genera un volcado del DDL real de TODAS las tablas (vía `pg_dump --schema-only` si hay acceso, o consultas a `information_schema`) y guárdalo en `supabase/schema-baseline.sql` (documentado como "foto del esquema, no migración ejecutable"). Esto cierra el hallazgo de la auditoría: hoy las tablas v1 no existen en ninguna migración y la base no se puede reconstruir desde el repo.

## Etapa 1 — Autorización real en la base (RLS por rol)

**El hallazgo 5.1 de la auditoría, prioridad #1.** Hoy las políticas de escritura solo exigen sesión (`auth.uid() IS NOT NULL` / `auth.role() = 'authenticated'`); el control por rol vive en la UI. Hay que llevar a RLS exactamente la matriz de permisos que la UI aplica hoy.

### 1a. Inventario de la matriz real

Construye la matriz **leyendo el código de la UI**, no la auditoría de memoria. Call-sites de escritura desde el navegador ya identificados (verifícalos y busca otros con `grep -rn "\.\(update\|insert\|upsert\|delete\)(" components/ lib/`):

| Tabla | Escriben desde cliente | Quién puede según la UI hoy |
|---|---|---|
| `prioridades_territoriales` | `ProjectTrackerModal` (semáforo, pct, ministerio, responsable, inversión, tags, prioridad, campos meta), `KanbanView:371` y `AttentionTray:336` (`en_foco`) | Verificar gating real (`canEditRegion`/`canEditAny` → admin/editor) |
| `seguimientos` | `modal/SeguimientoTab` (insert/update/delete) | Insert: cualquier autenticado (`canEditOperational`). Update/delete: verificar si la UI restringe a autor propio |
| `documentos_prioridad` | `modal/DocumentosTab` (insert/delete) + Storage | Igual que seguimientos; verificar gating de delete |
| `region_ejes` | `RegionEjesPanel` (insert/update/delete) | Verificar (estructural → admin/editor) |
| `metricas_eje` | `MetricaEditModal`, `MetricasEjeDrawer` | Verificar |
| `prego_monitoreo` | `lib/db.ts:updatePregoFase` | Vista PREGO está gateada a admin/editor |
| `semaforo_log`, `desalojo_log` | inserts de auditoría desde cliente | Insert por quien pueda editar lo logueado; nunca update/delete |
| Storage (bucket de documentos / planes regionales) | `DocumentosTab`, admin plan-regional | Revisar políticas del bucket también |

Documenta la matriz resultante (rol × tabla × operación) en el PR. **Esa matriz ES la especificación**; ante cualquier ambigüedad (p. ej. si un `viewer` hoy puede borrar un seguimiento ajeno desde la UI), pregunta al usuario en vez de decidir.

### 1b. Implementación

- Crea una función helper `SECURITY DEFINER` para leer el rol sin recursión de RLS, p. ej.:

```sql
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS
$$ SELECT role FROM user_profiles WHERE id = auth.uid() $$;
```

  (con `REVOKE ALL ... FROM anon` y `GRANT EXECUTE ... TO authenticated`; cuidado con el estado RLS de `user_profiles` según lo visto en Etapa 0).
- Reescribe las políticas de escritura por tabla según la matriz: estructurales (`prioridades_territoriales`, `region_ejes`, `metricas_eje`, `prego_monitoreo`) → `current_user_role() IN ('admin','editor')` en `USING` **y** `WITH CHECK`; operativas (`seguimientos`, `documentos_prioridad`) → INSERT cualquier autenticado, UPDATE/DELETE solo autor (`autor = auth.jwt()->>'email'` o el campo real) o admin — espejando lo que la UI hace hoy con la comparación de email en cliente.
- Las políticas de SELECT no se tocan en esta etapa (cambiarlas podría romper lecturas; queda anotado como decisión aparte para el usuario: hoy hay `SELECT USING (true)` en varias tablas).
- El `service_role` no se ve afectado (salta RLS) — las rutas API y syncs siguen igual.
- **No cambies ni una línea del código del cliente en esta etapa.** Solo SQL. Así, si algo sale mal, el rollback es re-aplicar las políticas anteriores (inclúyelas comentadas en la migración como referencia).

### 1c. Verificación (criterio de aceptación)

Script o checklist con los 4 roles (coordina con el usuario usuarios de prueba):

- Admin y editor: pueden editar semáforo/avance/tags exactamente como hoy. ✅
- Regional y viewer: la app se ve y funciona igual que hoy (solo lectura + propuestas). ✅
- **La prueba que hoy falla y debe pasar:** con sesión de `viewer`, un `UPDATE` directo vía consola del navegador (`getSupabase().from('prioridades_territoriales').update(...)`) debe devolver 0 filas afectadas. ✅
- Los syncs y rutas API siguen funcionando (usan service role). ✅

## Etapa 2 — Escrituras defensivas (matar los errores silenciosos)

**Hallazgo 6.3.** El patrón ya está documentado por el propio usuario (sesión 29-may): Supabase devuelve `200` con `data: []` cuando RLS bloquea, y el código actual no se entera. Esto es además el **complemento obligatorio de la Etapa 1**: al endurecer RLS, cualquier hueco que haya quedado en la matriz aparecería como escritura silenciosamente bloqueada — con este cambio, aparecerá como error visible y lo detectamos en días, no en meses.

- En TODOS los call-sites de escritura del cliente (lista de 1a): agregar `.select('<columnas mínimas>')` al final del `update`/`insert`/`delete`, chequear `error` **y** `data.length === 0`, y en caso de fallo: (a) NO aplicar la actualización optimista local — o revertirla si ya se aplicó, (b) avisar con el mecanismo de error **ya existente en ese componente** (sin UI nueva), (c) `console.error` con contexto.
- Extrae el patrón a un helper único (p. ej. `lib/dbWrite.ts`) para no duplicarlo 30 veces — pero que el helper sea transparente: mismos argumentos, misma semántica, cero cambio de comportamiento en el caso feliz.
- No toques la firma de `onUpdatePrioridad` ni el flujo de estado de `WorkOSApp` — solo el tramo "persistir y verificar".

**Criterio de aceptación:** con un usuario sin permiso (simulado quitándole el rol en BD), cada edición intenta → la UI no muestra éxito falso y el dato local no diverge del servidor. Con usuario válido: comportamiento idéntico al actual.

## Etapa 3 — Observabilidad mínima

**Hallazgo 6.7 (SEIA estuvo 53 días caído sin aviso).** Sin servicios nuevos que requieran cuenta, primero lo autosuficiente:

- Nueva ruta `app/api/health/route.ts` (GET, protegida con `CRON_SECRET` como los syncs): lee `sync_status`, compara `last_run_at` contra la frecuencia esperada de cada sync (deducirla de `vercel.json` + margen), y devuelve JSON con los atrasados y los que terminaron con `last_status != 'ok'` o `last_error_count > 0`.
- Cron en `vercel.json` (diario) que la invoque. Si hay una env `ALERT_WEBHOOK_URL` definida, postear el resumen ahí (formato genérico compatible con Slack/Discord); si no está definida, solo registrar — **degradación elegante, sin romper nada**. Documentar la variable en `.env.example`.
- Asegurar que TODOS los syncs escriben a `sync_status` al terminar, también cuando fallan (revisar que el `recordSyncStatus` esté en un `finally` o equivalente en los 13; donde no, agregarlo).
- (Opcional, marcar como decisión del usuario): integrar Sentry server-side. No instalarlo sin OK — requiere cuenta.

**Criterio de aceptación:** `GET /api/health` con el bearer correcto devuelve el estado real; un sync con fecha vieja en `sync_status` aparece como atrasado.

## Etapa 4 — Validación de entrada en rutas API (zod)

**Hallazgo 5.3.** Agregar `zod` (única dependencia nueva permitida en todo el plan, junto con las de test de la Etapa 7).

- Inventaria toda ruta en `app/api/**` que lea `request.json()` o `formData()` de un cliente (minuta, proposals, desalojos, import, admin/users, iniciativa, etc. — los syncs reciben de fuentes externas y también se benefician, pero prioriza las que reciben input de usuarios).
- Un schema zod por ruta, en el mismo archivo o en `lib/schemas/`. Ante input inválido: `400` con mensaje genérico (sin filtrar detalles internos). **El schema debe aceptar exactamente lo que el cliente actual envía** — derive los campos del código del cliente que llama a esa ruta, no de supuestos. Cero cambios en los componentes.
- De paso, verifica en cada una de esas rutas que el check de autorización server-side existe (rol correcto vía `requireAuth`/`canWrite`) y es coherente con la matriz de la Etapa 1. Donde falte, agrégalo (espejo de la UI, como siempre).

**Criterio de aceptación:** requests legítimos del front pasan idéntico; un body malformado devuelve 400 en vez de 500 o de escribir basura.

## Etapa 5 — Consolidación del modelo de datos (v1 → v2), sin borrar nada

**Hallazgo 4.1 — el corazón arquitectónico.** Objetivo de esta etapa: que **todas las lecturas** salgan del modelo v2, y v1 quede congelado como respaldo. El borrado físico de v1 NO es parte de este trabajo (quedará para cuando el usuario lo decida, semanas después de verificar estabilidad).

Orden estricto:

1. **Inventario de lecturas v1:** grep de `seia_projects`, `mop_projects`, `region_metrics`, `regional_metrics`, `stop_stats` en `components/`, `lib/`, `app/` (excluyendo los syncs, que escriben). Documenta cada lectura y su equivalente v2.
2. **Verificación de paridad con SQL** (por par de tablas): conteos, y diffs por llave (`EXCEPT` / `LEFT JOIN ... WHERE NULL`). Si v2 está incompleto respecto a v1 (p. ej. series históricas que solo existen en `regional_metrics`), **detente y reporta**: primero se rellena v2 (backfill idempotente vía script en `scripts/`, usando service role, con OK del usuario), después se migran lecturas.
3. **Migrar lecturas módulo por módulo** (un commit por módulo): la función de `lib/db.ts` correspondiente pasa a leer v2 y a devolver **exactamente la misma forma de datos** (mismo tipo TS, mismos nombres de campo, mismo orden) — el componente no se toca ni se entera. Verificación por módulo: misma pantalla, mismos números (capturas o comparación de respuestas antes/después con el mismo dato).
4. **Congelar escrituras v1** — solo cuando TODAS las lecturas estén en v2 y verificadas: quitar el tramo v1 del dual-write de cada sync, en un commit propio por sync, fácil de revertir. Las tablas v1 quedan intactas como archivo histórico.
5. **Actualizar `CLAUDE.md`** para que la sección de modelo de datos refleje la nueva realidad (v2 única fuente de lectura; v1 congelado con fecha).

**Casos con cuidado especial:** `region_metrics` (ancho, ~90 columnas) puede no tener equivalente v2 completo — si es el caso, esta sub-migración se pospone y se documenta, NO se improvisa un modelo nuevo. La regla de toda la etapa: ante paridad dudosa, no migrar y reportar.

## Etapa 6 — Llave estable en mutaciones (`n` → `id`)

**Hallazgo 4.4.** Hoy las mutaciones hacen `.eq('n', prioridad.n)`. Confirmado en Etapa 0 que `id` existe y es PK/único:

- Agregar `id` al tipo `Iniciativa` y al mapeo `mapRow` de `lib/db.ts` (hoy lo descarta) — cambio interno, invisible.
- Cambiar todos los `.eq('n', ...)` de mutación a `.eq('id', ...)` (los SELECT pueden seguir ordenando/mostrando por `n`, que es dato de negocio legítimo).
- `n` no se elimina ni se deja de mostrar — solo deja de ser la llave con la que se escribe.

**Criterio de aceptación:** editar cualquier campo funciona igual; `semaforo_log`/`seguimientos` siguen referenciando correctamente (verificar a qué apuntan sus FKs lógicas — si apuntan a `n`, documentarlo y NO romperlo; ese cambio de FK es decisión aparte).

## Etapa 7 — Red mínima de tests

**Hallazgo 6.4.** Instalar `vitest` (+ `@vitest/coverage-v8` opcional) como devDependency, script `npm test`. Sin tests de UI, sin snapshots. Foco quirúrgico:

- `lib/db.ts`: `mapRow` (defaults, nulls, tags vacíos, `en_foco`/`es_desalojo` ausentes).
- `lib/importParser.ts`: casos felices + filas malformadas (es el parser de Excel que alimenta propuestas — 551 líneas frágiles).
- Parseo de fechas BCCh (`DD-MM-YYYY` → ISO) y el invariante `region_id = 0`.
- Los schemas zod de la Etapa 4 (válido pasa / inválido falla).
- Si es viable sin infraestructura pesada: test de la matriz RLS con dos clientes supabase-js (anon con sesión de viewer vs. editor) contra un proyecto de prueba — si no hay proyecto de prueba, dejar el script en `scripts/test-rls.ts` para ejecución manual documentada, y que el checklist de la Etapa 1 sea la verificación oficial.

**Criterio de aceptación:** `npm test` verde en local; documentado en `CLAUDE.md` (sustituye al "no hay tests, valida con build").

## Etapa 8 — Limpiezas de código sin efecto visible

Cierre de hallazgos menores, juntos en una rama:

- `SEMAFORO_CONFIG` duplicado: borrar la copia local de `NationalDashboard.tsx:22` e importar desde `lib/config.ts` (verificar que los valores sean idénticos ANTES de borrar; si difieren, preguntar cuál es el canónico — hay riesgo de cambio visual si difieren).
- Cálculo RAG repetido (`WorkOSApp`, `KanbanView`, `AttentionTray`, `ProjectsPanel`): extraer a `lib/semaforo.ts` un helper puro `ragCounts(list)` / `avgPct(list)` y usarlo en los 4 sitios. Mismo output garantizado por los tests de la Etapa 7.
- `app/page.tsx`: cachear el `geojson` a nivel de módulo (hoy se lee de disco en cada request) y eliminar el fallback a CSV si el usuario confirma que ya no aplica (preguntar antes — es borrado de código de respaldo).
- Duplicado de líneas `COLEGA` en `.env.local`: avisar al usuario para que lo limpie a mano (no editar su .env).
- `@types/leaflet` y `@types/sql.js` de `dependencies` a `devDependencies`.
- Revisar si `sql.js` y `xlsx` se usan realmente donde se declaran; `xlsx@0.18.5` (npm) está abandonado upstream — investigar y reportar al usuario CVEs conocidos y la alternativa oficial (`cdn.sheetjs.com`) o `exceljs`, SIN cambiar la librería todavía (el reemplazo podría alterar el formato de los Excel exportados → requiere decisión y pruebas aparte).

## Etapa 9 — Sync SEIA dentro del límite de plataforma

**Hallazgo 6.6:** la corrida completa tarda ~340 s y `maxDuration` (techo de Vercel) es 300 s.

- Refactorizar `seia-sync` a **troceado reanudable**: procesar por bloques (páginas o regiones) con presupuesto de tiempo explícito (p. ej. cortar limpio a los 240 s), persistir el cursor de avance (columna/fila en `sync_status` o tabla auxiliar pequeña), y al invocarse de nuevo continuar donde quedó. El cron puede pasar a 2 invocaciones (p. ej. lunes 08:00 y 08:10) para cubrir la corrida completa.
- Misma forma de datos, mismas tablas destino, mismo resultado final que hoy cuando termina — solo cambia CÓMO llega.
- Aplicar el mismo patrón de presupuesto de tiempo (aunque hoy les sobre) a `mop-sync` y `stop-sync` si el costo marginal es bajo; si no, documentarlo como pendiente.

**Criterio de aceptación:** una corrida completa de SEIA termina (en 1–2 invocaciones) con `synced_at` fresco en todas las filas y `sync_status` reflejando el progreso. Ninguna invocación se acerca al límite de 300 s.

---

## Qué queda explícitamente FUERA de este trabajo

No lo hagas aunque la auditoría lo mencione — son cambios funcionales/visuales o decisiones del usuario:

- Supabase **Realtime** / edición concurrente (cambia comportamiento).
- Descomposición de god components y refactors de UI.
- Sistema de toasts, tokens de diseño, paleta, `globals.css`.
- Endurecer las políticas de **SELECT** (`USING (true)`) — documentar y proponer, no aplicar.
- Borrado físico de tablas v1, renombres de tablas, convención de nombres.
- Reemplazo de la librería `xlsx` (solo investigar y reportar).
- Cualquier `npm install` fuera de `zod` y `vitest`.

## Checklist de humo final (correr tras CADA etapa)

1. `npm run build` verde.
2. Login con cada rol → las 4 vistas principales (Mapa, Dashboard, Atención, Kanban) cargan idéntico, mismos números.
3. Como editor: cambiar un semáforo, un % de avance y un tag → persiste tras recargar.
4. Como viewer: la consola del navegador NO puede escribir en `prioridades_territoriales` (post Etapa 1).
5. Crear un seguimiento y subir un documento como usuario operativo → funciona igual que hoy.
6. `POST /api/seia-sync` manual con bearer → termina y actualiza `sync_status`.
7. Generar una minuta PDF de una región → idéntica a la de ayer.

## Formato de entrega

Al cerrar cada etapa: resumen en 5-10 líneas (qué cambió, archivos, migraciones a aplicar y su SQL de verificación, qué debe probar el usuario a mano), y **detenerse a esperar confirmación antes de la etapa siguiente**. Al cerrar todo: actualizar `CLAUDE.md` y `AGENTS.md` con los nuevos invariantes (RLS por rol espejo de la UI, helper de escrituras defensivas, zod obligatorio en rutas con body, `npm test`, modelo v2 como única lectura), y un changelog final en `docs/consolidacion-backend-resultado.md`.
