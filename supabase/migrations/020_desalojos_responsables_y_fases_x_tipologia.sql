-- ============================================================================
-- 020 — Responsables por capa (JSONB) + nota sobre fases aplicables por tipología
-- ============================================================================
-- v3.1: La sección Desalojos ahora reconoce que las fases varían por tipología:
--   A — Fiscal SERVIU:             PR · F1 · F2 · F3 · F4 · F5  (todo)
--   B — Fiscal no-SERVIU:          PR · F1 · F2 · F3 · F4 · F5  (F4 vía convenio)
--   C — Privado con fallo firme:   PR · F1 · F2 · F3 ·  ·  · F5  (sin F4 — propietario paga)
--   D — Privado sin instrumento:   PR  ·   ·   ·   ·   ·   ·     (sólo PR mientras se decide vía)
--
-- IMPORTANTE: NO borramos las filas de desalojo_fase_estado para las fases que
-- una tipología no usa. La regla "conservar silencioso" significa que si la
-- capa cambia de tipología (por ej. C → A), los datos previos en F4 reaparecen
-- intactos. La filtración es 100% en config TS + UI; el modelo de datos no
-- conoce el concepto "fase aplicable".
--
-- Lo único que esta migración necesita persistir es el JSONB responsables:
--   { "<rol_key>": { "nombre": "...", "institucion": "...", "email": "...",
--                    "telefono": "...", "notas": "..." } }
-- Los roles vigentes por tipología están en lib/desalojos.ts (TIPOLOGIA_CFG[t].roles).
-- Los huérfanos por cambio de tipología se conservan (shallow merge en server).
-- ============================================================================

BEGIN;

ALTER TABLE desalojo_capas
  ADD COLUMN IF NOT EXISTS responsables JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;

-- ─── Verificación ────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'desalojo_capas' AND column_name = 'responsables';
-- Debe devolver: responsables | jsonb | '{}'::jsonb
