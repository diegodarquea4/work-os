-- ==========================================================================
-- Desalojos v3 — fase como unidad de gestión (PR, F1, F2, F3, F4, F5)
--
-- Por qué v3: la metodología real de la Mesa (minuta 038, mayo 2026) organiza
-- el seguimiento POR FASE, no por dimensión transversal. El tablero oficial
-- semaforiza PR / F1 / F2 / F3 / F4 / F5; las dimensiones (Jurídico /
-- Seguridad / Social / Financiamiento) son atributos transversales que viven
-- DENTRO de cada fase, no en paralelo:
--   PR — Prerrequisitos jurídicos + financiamiento (Jurídico)
--   F1 — Intervención policial (Seguridad)
--   F2 — Catastro social (Social)
--   F3 — Desalojo (Seguridad operativa)
--   F4 — Demolición (Financiamiento DIPRES — regla dura)
--   F5 — Recuperación
--
-- Cambios v3 respecto a v2 (migración 018):
--   1. desalojo_capas pierde los 4 sem_* y paso0_estado (se mueven a
--      desalojo_fase_estado).
--   2. Nueva tabla desalojo_fase_estado: 1 fila por capa × fase. Lleva
--      semáforo y checklist_estado JSONB (items definidos en lib/desalojos.ts
--      por tipología y fase).
--   3. desalojo_capas gana campos de catastro detallado (Sección II del 038):
--      viviendas, hogares, adultos mayores, embarazadas, discapacidad,
--      migrantes regular/irregular.
--   4. desalojo_log gana col `fase` para trazar cambios por fase.
--   5. Vocabulario de fase normalizado a códigos cortos: pr, f1, f2, f3,
--      f4, f5, cerrado (consistente con el tablero del PDF).
--
-- Migración de datos:
--   - Cada capa existente genera 6 filas en desalojo_fase_estado.
--   - sem_juridico → PR, sem_seguridad → F1, sem_social → F2, sem_financiamiento → F4.
--   - paso0_estado actual se mueve a checklist_estado de la fila PR.
--   - F3 y F5 arrancan en 'gris' (no había mapeo en v2).
--   - fase_actual se remapea: habilitacion → pr, f1_policial → f1,
--     f2_catastro → f2, f3f4_operativo → f3, f5_recuperacion → f5, cerrado → cerrado.
-- ==========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. desalojo_fase_estado — semáforo + checklist por capa × fase
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS desalojo_fase_estado (
  id              BIGSERIAL   PRIMARY KEY,
  prioridad_id    INT         NOT NULL,    -- FK lógico
  capa_id         BIGINT      NOT NULL,    -- FK lógico a desalojo_capas.id
  fase            TEXT        NOT NULL
                    CHECK (fase IN ('pr','f1','f2','f3','f4','f5')),
  semaforo        TEXT        NOT NULL DEFAULT 'gris'
                    CHECK (semaforo IN ('verde','ambar','rojo','gris')),

  -- Estado del checklist específico de la tipología × fase. Items definidos
  -- en lib/desalojos.ts (CHECKLISTS_FASE). Shallow merge en PATCH; items
  -- huérfanos (cambio de tipología) se conservan pero no se renderizan.
  -- Forma: { "item_key": { "done": bool, "fecha": "YYYY-MM-DD" | null } }
  checklist_estado JSONB      NOT NULL DEFAULT '{}'::jsonb,

  notas           TEXT,
  completed_at    TIMESTAMPTZ,  -- llenado por handler cuando semáforo pasa a verde
  completed_by    TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (capa_id, fase)
);

CREATE INDEX IF NOT EXISTS idx_desalojo_fase_estado_lookup
  ON desalojo_fase_estado(prioridad_id, capa_id, fase);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Campos de catastro detallado en desalojo_capas (Sección II del 038)
-- ─────────────────────────────────────────────────────────────────────────
-- personas y nna ya existen (se mantienen). Sumamos el resto.

ALTER TABLE desalojo_capas
  ADD COLUMN IF NOT EXISTS viviendas            INTEGER,
  ADD COLUMN IF NOT EXISTS hogares              INTEGER,
  ADD COLUMN IF NOT EXISTS adultos_mayores      INTEGER,
  ADD COLUMN IF NOT EXISTS embarazadas          INTEGER,
  ADD COLUMN IF NOT EXISTS personas_discapacidad INTEGER,
  ADD COLUMN IF NOT EXISTS migrantes_regular    INTEGER,
  ADD COLUMN IF NOT EXISTS migrantes_irregular  INTEGER;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. desalojo_log gana col fase
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE desalojo_log
  ADD COLUMN IF NOT EXISTS fase TEXT
    CHECK (fase IS NULL OR fase IN ('pr','f1','f2','f3','f4','f5'));

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Migrar fase_actual de capas al vocabulario nuevo
-- ─────────────────────────────────────────────────────────────────────────
-- Soltamos el CHECK viejo, mapeamos valores, ponemos el CHECK nuevo.

-- Drop CHECK viejo (nombre se infiere; PostgreSQL lo nombra
-- desalojo_capas_fase_actual_check si no fue renombrado).
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'desalojo_capas'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%fase_actual%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE desalojo_capas DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- Soltar el default viejo antes de remapear (apunta al valor textual antiguo).
ALTER TABLE desalojo_capas ALTER COLUMN fase_actual DROP DEFAULT;

UPDATE desalojo_capas
   SET fase_actual = CASE fase_actual
     WHEN 'habilitacion'   THEN 'pr'
     WHEN 'f1_policial'    THEN 'f1'
     WHEN 'f2_catastro'    THEN 'f2'
     WHEN 'f3f4_operativo' THEN 'f3'
     WHEN 'f5_recuperacion' THEN 'f5'
     WHEN 'cerrado'        THEN 'cerrado'
     ELSE 'pr'
   END
 WHERE fase_actual IN ('habilitacion','f1_policial','f2_catastro','f3f4_operativo','f5_recuperacion','cerrado');

-- Default nuevo + CHECK nuevo con vocabulario corto.
ALTER TABLE desalojo_capas ALTER COLUMN fase_actual SET DEFAULT 'pr';
ALTER TABLE desalojo_capas ADD CONSTRAINT desalojo_capas_fase_actual_check
  CHECK (fase_actual IN ('pr','f1','f2','f3','f4','f5','cerrado'));

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Crear las 6 filas de desalojo_fase_estado por cada capa existente
-- ─────────────────────────────────────────────────────────────────────────
-- Idempotente — ON CONFLICT no aplica acá porque la UNIQUE es (capa_id, fase)
-- y solo insertamos las que no existen.

INSERT INTO desalojo_fase_estado (prioridad_id, capa_id, fase, semaforo, checklist_estado)
SELECT
  c.prioridad_id,
  c.id,
  f.fase,
  CASE f.fase
    WHEN 'pr' THEN c.sem_juridico
    WHEN 'f1' THEN c.sem_seguridad
    WHEN 'f2' THEN c.sem_social
    WHEN 'f4' THEN c.sem_financiamiento
    ELSE 'gris'
  END,
  CASE WHEN f.fase = 'pr' THEN c.paso0_estado ELSE '{}'::jsonb END
FROM desalojo_capas c
CROSS JOIN (VALUES ('pr'),('f1'),('f2'),('f3'),('f4'),('f5')) AS f(fase)
WHERE NOT EXISTS (
  SELECT 1 FROM desalojo_fase_estado e
  WHERE e.capa_id = c.id AND e.fase = f.fase
);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. DROP de las cols de v2 en desalojo_capas (movidas a desalojo_fase_estado)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE desalojo_capas
  DROP COLUMN IF EXISTS sem_juridico,
  DROP COLUMN IF EXISTS sem_seguridad,
  DROP COLUMN IF EXISTS sem_social,
  DROP COLUMN IF EXISTS sem_financiamiento,
  DROP COLUMN IF EXISTS paso0_estado;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. RLS admin-only en la tabla nueva
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE desalojo_fase_estado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "desalojo_fase_estado_admin_all" ON desalojo_fase_estado;

CREATE POLICY "desalojo_fase_estado_admin_all" ON desalojo_fase_estado
  FOR ALL
  USING       (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK  (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- Verificación post-migración
-- ─────────────────────────────────────────────────────────────────────────
-- 1) 6 filas de fase por cada capa:
--    SELECT
--      (SELECT COUNT(*) FROM desalojo_capas)         AS n_capas,
--      (SELECT COUNT(*) FROM desalojo_fase_estado)   AS n_filas_fase;
--    -- n_filas_fase debe ser n_capas * 6.
--
-- 2) Vocabulario nuevo aplicado a fase_actual:
--    SELECT DISTINCT fase_actual FROM desalojo_capas;
--    -- Debe estar dentro de ('pr','f1','f2','f3','f4','f5','cerrado').
--
-- 3) Cols viejas eliminadas:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'desalojo_capas'
--      AND column_name IN ('sem_juridico','sem_seguridad','sem_social','sem_financiamiento','paso0_estado');
--    -- 0 filas.
--
-- 4) Policy admin-only:
--    SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'desalojo_fase_estado';
--    -- 1 fila: FOR ALL.
