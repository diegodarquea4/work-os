-- ============================================================================
-- 021 — Documentos vinculados a items del checklist (fase + item_key)
-- ============================================================================
-- Hasta v3 los documentos se asociaban como:
--   capa_id IS NULL  → documento general del caso
--   capa_id NOT NULL → documento de la capa, opcionalmente con dimension
--
-- v3.2 permite además vincular un doc a un ITEM ESPECÍFICO del checklist
-- (ej. la resolución exenta SERVIU para el item `resolucion_publicada_do`
-- del checklist PR). Esto desbloquea:
--   - "Sube la resolución" directo desde el checkbox del item.
--   - Vista de docs por item ("¿qué papel cubre este chequeo?").
--   - El item_key es el FK lógico a TIPOLOGIA_CFG[t].checklists[fase][i].key.
--     No se valida en BD (los keys cambian con el config TS), pero el server
--     valida que pertenezca al config vigente al subir.
--
-- Backwards compatible: documentos sin fase/item_key siguen siendo válidos
-- (general del caso o de la capa/dimensión).
-- ============================================================================

BEGIN;

ALTER TABLE desalojo_documentos
  ADD COLUMN IF NOT EXISTS fase     TEXT,
  ADD COLUMN IF NOT EXISTS item_key TEXT;

-- Constraint suave: si hay item_key, debe haber fase (no tiene sentido item
-- sin fase). fase puede existir sola (doc de la fase, no de un item puntual).
ALTER TABLE desalojo_documentos
  DROP CONSTRAINT IF EXISTS desalojo_documentos_item_requires_fase;

ALTER TABLE desalojo_documentos
  ADD CONSTRAINT desalojo_documentos_item_requires_fase
    CHECK (item_key IS NULL OR fase IS NOT NULL);

-- Validar vocabulario de fase si está presente.
ALTER TABLE desalojo_documentos
  DROP CONSTRAINT IF EXISTS desalojo_documentos_fase_valid;

ALTER TABLE desalojo_documentos
  ADD CONSTRAINT desalojo_documentos_fase_valid
    CHECK (fase IS NULL OR fase IN ('pr', 'f1', 'f2', 'f3', 'f4', 'f5'));

-- Index para queries por (capa, fase, item).
DROP INDEX IF EXISTS idx_desalojo_documentos_item;
CREATE INDEX idx_desalojo_documentos_item
  ON desalojo_documentos(capa_id, fase, item_key)
  WHERE capa_id IS NOT NULL AND fase IS NOT NULL;

COMMIT;

-- ─── Verificación ────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'desalojo_documentos' AND column_name IN ('fase', 'item_key');
-- Debe devolver dos filas (text, text).
--
-- SELECT conname FROM pg_constraint
--   WHERE conrelid = 'desalojo_documentos'::regclass
--     AND conname  LIKE 'desalojo_documentos_%';
-- Debe incluir desalojo_documentos_item_requires_fase y desalojo_documentos_fase_valid.
