-- ==========================================================================
-- Versionar tabla `seia_projects` (existe en prod desde 2026-04-06)
--
-- Esta tabla se creó manualmente en producción cuando se desplegó el sync
-- SEIA (commit fcf5ec9). Nunca se versionó en migrations/. Acá la capturamos
-- usando CREATE TABLE IF NOT EXISTS para no romper la existente, pero dejar
-- el schema en código.
--
-- Schema deducido del UpsertRow en app/api/seia-sync/route.ts:113-128.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS seia_projects (
  id                  TEXT PRIMARY KEY,                  -- EXPEDIENTE_ID de SEIA
  region_id           SMALLINT NOT NULL,                 -- INE_CODE (1..16)
  nombre              TEXT NOT NULL,                     -- EXPEDIENTE_NOMBRE
  tipo                TEXT,                              -- DESCRIPCION_TIPOLOGIA
  estado              TEXT,                              -- ESTADO_PROYECTO
  titular             TEXT,
  inversion_mm        NUMERIC,                           -- MM USD
  fecha_presentacion  DATE,
  fecha_plazo         DATE,
  actividad_actual    TEXT,
  url_ficha           TEXT,                              -- EXPEDIENTE_URL_PPAL
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seia_projects_region
  ON seia_projects(region_id);

CREATE INDEX IF NOT EXISTS idx_seia_projects_fecha_pres
  ON seia_projects(fecha_presentacion DESC);

ALTER TABLE seia_projects ENABLE ROW LEVEL SECURITY;

-- Read público (mismo patrón que otras tablas de proyectos externos).
DO $$ BEGIN
  CREATE POLICY "public_read_seia_projects"
    ON seia_projects FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
