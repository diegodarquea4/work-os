-- ==========================================================================
-- Tabla `import_proposals` — propuestas de actualización de iniciativas
--
-- Workflow de two-stage push:
--   1. Una delegación regional (rol 'regional') sube un .xlsx de propuesta.
--      El archivo va al bucket `import-proposals` (Storage). Se crea una fila
--      con status='pending'.
--   2. Un admin/editor descarga el archivo, lo revisa offline, y vuelve al
--      panel a "Confirmar carga" (approve) o "Rechazar" (reject).
--   3. Al aprobar: el servidor parsea el .xlsx, aplica los cambios a
--      `prioridades_territoriales`, registra en `import_log`, deja status
--      en 'approved' (o 'applied_with_errors' si hubo errores parciales).
--   4. Al rechazar: solo se marca 'rejected' con reviewer_note.
--   5. En ambos casos el archivo se BORRA de Storage al resolverse — la fila
--      queda como audit pero sin archivo descargable.
--
-- IMPORTANTE:
--   El bucket `import-proposals` (privado) debe crearse manualmente desde
--   Supabase Dashboard antes de habilitar el flujo en la UI.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS import_proposals (
  id                BIGSERIAL PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  proposer_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposer_email    TEXT NOT NULL,
  file_path         TEXT NOT NULL,       -- path dentro del bucket import-proposals
  file_name         TEXT NOT NULL,       -- nombre original que subió el usuario
  regions_claim     TEXT[],              -- regiones que el proponente declara tocar (UI hint)
  proposer_note     TEXT,                -- comentario opcional del proponente
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'applied_with_errors')),
  reviewer_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_email    TEXT,
  reviewer_note     TEXT,
  reviewed_at       TIMESTAMPTZ,
  applied_inserted  INTEGER,
  applied_updated   INTEGER,
  applied_errors    JSONB                -- array de mensajes de error si los hubo al aplicar
);

-- Índice parcial: la cola activa es solo lo pending; el resto es histórico.
CREATE INDEX IF NOT EXISTS idx_import_proposals_pending
  ON import_proposals(status, created_at DESC) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_import_proposals_proposer
  ON import_proposals(proposer_id, created_at DESC);

ALTER TABLE import_proposals ENABLE ROW LEVEL SECURITY;

-- Lectura: el proponente ve sus propuestas; admin/editor ven todas.
DROP POLICY IF EXISTS "proposals_read" ON import_proposals;
CREATE POLICY "proposals_read" ON import_proposals
  FOR SELECT
  USING (
    proposer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','editor'))
  );

-- Inserción: solo el propio usuario puede crear sus propuestas (proposer_id = auth.uid()).
DROP POLICY IF EXISTS "proposals_insert_self" ON import_proposals;
CREATE POLICY "proposals_insert_self" ON import_proposals
  FOR INSERT
  WITH CHECK (proposer_id = auth.uid());

-- Update (aprobar/rechazar propuestas): solo admin. Editores pueden editar en
-- línea las iniciativas pero no son los gatekeepers de cargas masivas externas.
DROP POLICY IF EXISTS "proposals_update_admin" ON import_proposals;
CREATE POLICY "proposals_update_admin" ON import_proposals
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Verificación ──────────────────────────────────────────────────────────
-- SELECT COUNT(*) FROM import_proposals;            -- 0 inicialmente
-- SELECT * FROM pg_indexes WHERE tablename = 'import_proposals';
