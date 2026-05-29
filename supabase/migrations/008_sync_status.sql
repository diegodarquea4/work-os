-- ==========================================================================
-- Tabla sync_status — observabilidad de los crons de sincronización
--
-- Una fila por sync (PK = name). Se sobreescribe en cada ejecución con el
-- resultado de la última corrida. Sin historial — para historial completo
-- usar Vercel logs o agregar tabla sync_log más adelante.
--
-- Contexto del diseño:
--   - El 2026-05-29 descubrimos que seia-sync y mop-sync llevaban 53 días
--     sin actualizar synced_at porque el cron caía por timeout sin avisar.
--   - Sin esta tabla, el único termómetro era MAX(synced_at) en cada tabla
--     de datos, lo cual obliga a saber a qué tabla mirar y no distingue
--     "falló" de "no había nada nuevo que actualizar".
--   - Con esta tabla, una sola query muestra el estado de los 13 syncs.
-- ==========================================================================

CREATE TABLE sync_status (
  name              TEXT PRIMARY KEY,                    -- 'seia', 'mop', 'ine', etc.
  last_run_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_status       TEXT NOT NULL CHECK (last_status IN ('ok','partial','error')),
  last_duration_ms  INTEGER,
  last_rows         INTEGER,                              -- filas upserteadas
  last_error_count  INTEGER NOT NULL DEFAULT 0,
  last_error_sample TEXT,                                 -- primeros ~3 errores como JSON o texto
  notes             TEXT
);

-- Lectura pública del estado (no es info sensible — solo timestamps + counts).
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_sync_status"
  ON sync_status FOR SELECT
  USING (true);

-- ── Verificación ──────────────────────────────────────────────────────────
-- SELECT name, last_run_at, last_status, last_rows, last_error_count
-- FROM sync_status
-- ORDER BY last_run_at DESC;
