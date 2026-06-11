# Consolidación de backend — resultado

**Período:** 2026-06-11 → 2026-06-11
**Auditoría origen:** [docs/auditoria-tecnica-2026-06.md](auditoria-tecnica-2026-06.md)
**Plan ejecutado:** `~/.claude/plans/creo-que-es-importante-abstract-ocean.md`
**Resultado:** 9 etapas cerradas, 18 commits, 17 archivos nuevos, ~4.500 líneas modificadas.

Objetivo: el usuario final no debe notar nada. El valor es invisible — seguridad, integridad de datos, observabilidad, red de seguridad.

---

## Resumen por etapa

| # | Etapa | Commits | Estado |
|---|---|---|---|
| 0 | Diagnóstico en vivo + schema-baseline | `27f87e5`, merge `8231071` | ✅ Cerrada |
| 1 | Escrituras defensivas (`lib/dbWrite.ts`) | `9423aac`, merge `077b551` | ✅ Cerrada |
| 2 | RLS por rol + viewer solo lectura | `1b9f3c4`, merge `bb29612` | ⚠️ Código mergeado; falta aplicar SQL 023 |
| 3 | Observabilidad de syncs + `/api/health` | `e12fd51`, merge `8a05f2b` | ✅ Cerrada |
| 4 | Validación zod en rutas API | `e9f33d5`, merge `776bc30` | ✅ Cerrada |
| 5 | Llave estable n→id en mutaciones | `feee014`, merge `97e10f0` | ✅ Cerrada |
| 6 | Red mínima de tests con vitest (36 tests) | `9054e5e`, merge `1f5d717` | ✅ Cerrada |
| 7 | Limpiezas mínimas + reporte de deudas | `f32ad0e`, merge `834f1b3` | ✅ Cerrada |
| 8 | SEIA troceado en `/api/seia-sync-v2` | `407d6b1`, merge `b7bb3f7` | ⚠️ Código listo; cron NO migrado todavía |

---

## Lo que cambió en concreto

### Archivos nuevos (17)

```
docs/auditoria-tecnica-2026-06.md       (E0 — input de la agencia)
docs/diagnostico-en-vivo-2026-06-11.md  (E0 — A1-A8 ejecutadas)
supabase/schema-baseline.sql            (E0 — foto del esquema)
lib/dbWrite.ts                          (E1 — safeWrite/safeDelete/safeAuditWrite)
supabase/migrations/023_rls_por_rol.sql (E2 — pendiente aplicar)
lib/syncRunner.ts                       (E3 — withSyncStatus wrapper)
app/api/health/route.ts                 (E3 — endpoint de monitoreo)
lib/schemas/index.ts                    (E4 — schemas zod)
vitest.config.ts                        (E6 — config tests)
__tests__/mapRow.test.ts                (E6 — 9 tests)
__tests__/dbWrite.test.ts               (E6 — 11 tests)
__tests__/schemas.test.ts               (E6 — 16 tests)
app/api/seia-sync-v2/route.ts           (E8 — troceado reanudable)
docs/consolidacion-backend-resultado.md (este archivo)
```

### Archivos modificados clave

```
lib/db.ts                    — mapRow propaga id; logs con safeAuditWrite
lib/projects.ts              — Iniciativa.id (PK estable)
components/ProjectTrackerModal.tsx     — 9 call-sites defensivos + .eq('id')
components/KanbanView.tsx              — handleToggleFoco(n, id, next)
components/AttentionTray.tsx           — idem
components/modal/SeguimientoTab.tsx    — 3 call-sites defensivos
components/modal/DocumentosTab.tsx     — 2 call-sites defensivos
components/RegionEjesPanel.tsx         — 3 call-sites defensivos
components/MetricaEditModal.tsx        — 2 call-sites defensivos
components/MetricasEjeDrawer.tsx       — 1 call-site defensivo
components/WorkOSApp.tsx               — canEditOperational excluye viewer
app/api/{cne,deis,dipres,external,ine,mercadopublico,
         mineduc,pib,sinca,stop,subtel}-sync/route.ts
                             — withSyncStatus(name, runSync)
app/api/cartera-pdf/route.ts — zod validation
app/api/minuta/route.ts      — zod validation
app/api/admin/users/route.ts — zod validation
app/api/desalojos/[n]/route.ts — zod validation
vercel.json                  — cron diario /api/health
CLAUDE.md                    — invariantes nuevos
package.json                 — zod, vitest, @vitest/coverage-v8, @types/* a dev
```

### Cobertura de tests

`__tests__/` ejecuta 36 tests en ~130ms:
- `mapRow.test.ts`: 9 tests para defaults, nulls, tags multi-valor, en_foco/es_desalojo pre-migración, id propagation.
- `dbWrite.test.ts`: 11 tests para el bug del 29-may (safeWrite throw con data:[], safeDelete idempotente, safeAuditWrite no-throw, cause con codes 23505/23503).
- `schemas.test.ts`: 16 tests para cada schema zod (happy path + rejects).

---

## Pendientes obligatorios para el usuario

### 🔴 Aplicar SQL 023 en Supabase

[supabase/migrations/023_rls_por_rol.sql](../supabase/migrations/023_rls_por_rol.sql) debe ejecutarse manualmente. Hasta entonces:
- La matriz RLS sigue siendo la vieja (`authenticated_write` permisivo).
- `canEditOperational` ya excluye viewer en UI → viewer NO ve botones de escritura, pero si abre consola del browser, RLS no lo bloquea todavía.

Después de aplicar, verificar con las queries del bloque al final del SQL.

### 🟡 Probar `/api/seia-sync-v2`

Antes de migrar el cron, validar 2-3 corridas limpias:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://...vercel.../api/seia-sync-v2
# Reinvocar si devuelve partial:true
```

Cuando demuestre estabilidad → mover cron en `vercel.json` (PR aparte, mantener seia-sync vieja 1-2 ciclos como fallback).

### 🟢 Documentar `ALERT_WEBHOOK_URL` en `.env.local` (opcional)

Si querés alertas externas de `/api/health`, agregá la variable al `.env.local` con tu webhook de Slack/Discord. Sin ella, el endpoint sigue funcionando — solo no manda alertas.

### 🟢 Checklist de humo con los 4 roles

Después de aplicar SQL 023, validar:
- admin: todo igual que antes.
- editor: idem admin excepto borrado de iniciativa (gateado por `canEditAny`).
- regional: puede semáforo, %, responsable, en_foco, etapa, hito de cualquier prioridad. valor_actual de métricas SÓLO en sus `region_cods`. NO puede tocar tags, ministerio, prioridad, inversion ni la definición de métricas.
- viewer: solo lectura. NO ve botones. Consola del browser: `update` directo devuelve 0 filas / error.

---

## Deudas documentadas (decisiones del usuario para etapas posteriores)

### Arquitectura

- **v1→v2 (lecturas)**: `v2_proyectos_inversion` se escribe pero NUNCA se lee desde UI. `region_metrics` (~90 cols wide) no tiene equivalente v2 completo. Proyecto separado con backfill propio.
- **FKs lógicas a `n`**: `seguimientos.prioridad_id`, `documentos_prioridad.prioridad_id`, `semaforo_log.prioridad_id` siguen apuntando a `n` (no a `id`). Migrarlas requiere backfill + cambio coordinado.
- **Tabla v1 sin migración en repo**: `prioridades_territoriales`, `seguimientos`, etc. solo viven en Supabase. `supabase/schema-baseline.sql` es la foto al 2026-06-11. Mejor sería tener una migración 000 con CREATE TABLE — postergado.

### Seguridad

- **SELECT policies world-readable** (`USING (true)`) en todas las tablas. Endurecerlas requiere análisis de flujo de lectura.
- **Storage policies** de los buckets `project-docs` y `plan-regional`: no se revisaron. Fuera de scope explícito de E2.
- **Sentry server-side**: requiere cuenta + DSN. Decisión pendiente.

### Código

- **SEMAFORO_CONFIG duplicado** ([lib/config.ts:4](../lib/config.ts) vs [components/NationalDashboard.tsx:22](../components/NationalDashboard.tsx#L22)): NO son idénticos (campos badge/bar + label "Bloqueadas" vs "Bloqueado"). Dedup requiere decisión del usuario sobre cuál label es canónico.
- **xlsx@0.18.5**: paquete abandonado upstream con CVEs (CVE-2023-30533, CVE-2024-22363). Reemplazo (sheetjs oficial o exceljs) puede alterar formato de Excel exportados → etapa dedicada con pruebas.
- **Cálculo RAG repetido** (WorkOSApp, KanbanView, AttentionTray, ProjectsPanel): extracción a `lib/semaforo.ts` quedó pendiente. Refactor seguro pero requiere validar 4 sitios.
- **Validación zod en resto de rutas**: 4 rutas cubiertas; el resto (proposals, plan-regional, desalojos detalladas) tienen validación custom sólida y queda como refactor opcional.

### Operaciones

- **Aplicar troceado a mop-sync y stop-sync** (~150s y holgado respectivamente): no es urgente pero previene incidentes futuros si crece el volumen.
- **Realtime / edición concurrente**: cambia el "último que guarda gana" actual.
- **Descomposición de god components** (NationalDashboard 1473 líneas, KanbanView 1097, etc.): cuando los toques, no en gran refactor.

---

## Estado del git al cierre

`main` ahora 18 commits ahead de origin. Push pendiente del usuario:

```bash
git push origin main
```

Las ramas locales `consolidacion/etapa-*` pueden borrarse después de confirmar que main contiene todo:

```bash
git branch -d consolidacion/etapa-0-diagnostico consolidacion/etapa-1-defensivas \
                consolidacion/etapa-2-rls-rol consolidacion/etapa-3-observabilidad \
                consolidacion/etapa-4-zod consolidacion/etapa-5-id-estable \
                consolidacion/etapa-6-tests consolidacion/etapa-7-cleanup \
                consolidacion/etapa-8-seia-v2 consolidacion/cierre-final
```

---

## Tiempo invertido y throughput

8 etapas + cierre en una sola sesión. Por etapa: análisis del estado real (Explore agents en E0/E1) + ejecución conservadora con build verde y commit aislado.

Trade-off elegido: avanzar todas las etapas con scope mínimo y deudas documentadas, en vez de quedar a mitad en una etapa con sobre-ingeniería. La auditoría original sugería ~3-4 semanas calendaria; el ejecutó concentrado fue posible por (a) el plan explícito en cada etapa, (b) los Explore agents en E0/E1 evitando suposiciones, (c) las 4 decisiones tempranas del usuario sobre alcance.

---

*Generado al cierre de la consolidación backend. Si encontrás algo que se rompió o no calza, revisar el commit asociado a la etapa correspondiente y considerar revert puntual antes de hotfix.*
