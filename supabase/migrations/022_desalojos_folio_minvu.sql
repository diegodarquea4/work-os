-- 022_desalojos_folio_minvu.sql
--
-- Permite vincular cada capa de desalojo a una entrada del catastro MINVU
-- (CNC 2026 — Catastro Nacional de Campamentos). El folio_minvu es el ID oficial
-- del campamento en el catálogo nacional; lat/lng son override manual de las
-- coords cuando el pin del catastro no es exacto o cuando no hay folio vinculado.
--
-- Resolución de coords (lado cliente):
--   1) si capa.lat / capa.lng están set → usar esos
--   2) si folio_minvu está set → heredar lat/lng del JSON bundled
--   3) si nada → la capa no aparece en el mapa
--
-- El catastro MINVU vive en public/data/catastro-minvu-2026.json (bundled
-- estático). No hay tabla de catastro en la BD — se publica cada par de años,
-- no tiene API, y queremos mantener el modelo simple.
--
-- Compatibilidad: si la migración ya corrió parcialmente (folio_minvu existe
-- pero no lat/lng), IF NOT EXISTS hace la operación idempotente.

BEGIN;

ALTER TABLE desalojo_capas
  ADD COLUMN IF NOT EXISTS folio_minvu TEXT,
  ADD COLUMN IF NOT EXISTS lat NUMERIC,
  ADD COLUMN IF NOT EXISTS lng NUMERIC;

COMMENT ON COLUMN desalojo_capas.folio_minvu IS
  'Folio del catastro MINVU CNC 2026 (vínculo al catálogo nacional). Si está set, coords heredadas si lat/lng son NULL.';
COMMENT ON COLUMN desalojo_capas.lat IS
  'Latitud manual (override). Si NULL y folio_minvu vinculado, hereda del catálogo bundled.';
COMMENT ON COLUMN desalojo_capas.lng IS
  'Longitud manual (override). Mismo comportamiento que lat.';

CREATE INDEX IF NOT EXISTS idx_desalojo_capas_folio_minvu
  ON desalojo_capas(folio_minvu)
  WHERE folio_minvu IS NOT NULL;

COMMIT;

-- Verificación post-migración:
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_name = 'desalojo_capas'
--    AND column_name IN ('folio_minvu','lat','lng');
-- Debe devolver 3 filas (TEXT, NUMERIC, NUMERIC).
