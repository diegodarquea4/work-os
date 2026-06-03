-- ==========================================================================
-- Tabla `import_log` — auditoría de cargas masivas aplicadas
--
-- Se escribe AL FINAL de cada aplicación efectiva sobre `prioridades_territoriales`,
-- sin importar el origen:
--   - source='direct'   → admin/editor importó vía POST /api/import (modal del
--     Dashboard nacional).
--   - source='proposal' → admin/editor aprobó una propuesta de regional vía
--     POST /api/proposals/[id]/approve. proposal_id queda con FK a la propuesta.
--
-- Esta tabla NO bloquea el response del endpoint: si por algún motivo la inserción
-- falla, los endpoints capturan el error y siguen devolviendo el resumen al cliente.
-- La intención es trazabilidad, no consistencia transaccional.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS import_log (
  id                BIGSERIAL PRIMARY KEY,
  run_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_by_email  TEXT NOT NULL,
  source            TEXT NOT NULL CHECK (source IN ('direct', 'proposal')),
  proposal_id       BIGINT REFERENCES import_proposals(id) ON DELETE SET NULL,
  inserted_count    INTEGER NOT NULL DEFAULT 0,
  updated_count     INTEGER NOT NULL DEFAULT 0,
  error_count       INTEGER NOT NULL DEFAULT 0,
  errors            JSONB,                 -- array de mensajes si los hubo
  regions_touched   TEXT[],
  duration_ms       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_import_log_run_at ON import_log (run_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_log_proposal ON import_log (proposal_id) WHERE proposal_id IS NOT NULL;

ALTER TABLE import_log ENABLE ROW LEVEL SECURITY;

-- Solo admin/editor pueden leer el log (trazabilidad central).
DROP POLICY IF EXISTS "import_log_read_admin" ON import_log;
CREATE POLICY "import_log_read_admin" ON import_log
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','editor')));

-- ── Verificación ──────────────────────────────────────────────────────────
-- SELECT COUNT(*) FROM import_log;
-- SELECT * FROM import_log ORDER BY run_at DESC LIMIT 10;
