-- ==========================================================================
-- Versionar tabla `mop_projects` (existe en prod desde 2026-04-06)
--
-- Misma historia que seia_projects (migración 009). Se creó manualmente en
-- producción cuando se desplegó el sync MOP (commit d1088d0). Schema
-- deducido del type MopProject en lib/types.ts:188-203 y del UpsertRow
-- en app/api/mop-sync/route.ts.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS mop_projects (
  cod_p             TEXT PRIMARY KEY,                    -- cod_p de proyectos.mop.gob.cl
  bip               TEXT,                                -- código BIP cuando existe
  region_id         SMALLINT NOT NULL,                   -- INE_CODE (1..16)
  nombre            TEXT NOT NULL,
  servicio          TEXT,                                -- DOH, DOP, Vialidad, etc.
  programa          TEXT,
  etapa             TEXT,                                -- Diseño / Ejecución / Termino
  financiamiento    TEXT,
  inversion_miles   INTEGER,                             -- miles de CLP
  provincias        TEXT,
  comunas           TEXT,
  planes            TEXT,
  descripcion       TEXT,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mop_projects_region
  ON mop_projects(region_id);

CREATE INDEX IF NOT EXISTS idx_mop_projects_etapa
  ON mop_projects(etapa);

ALTER TABLE mop_projects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "public_read_mop_projects"
    ON mop_projects FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
