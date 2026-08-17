-- ============================================================================
-- 061_infraestructura_megaproyectos.sql
--
-- "Megaproyectos" del Comité de Infraestructura: un sub-conjunto CURADO de
-- los tags de prioridades_territoriales (mig 016) que agrupa la vista de
-- "Iniciativas contempladas" del tab. NO son todos los tags de la región —
-- son los que el comité decide marcar como megaproyecto (ej. "Puerto de
-- Arica", "Ruta 5") desde el botón "Megaproyectos" junto a "Nómina".
--
-- Reusa el campo tags existente (sin catálogo nuevo, mismo criterio que
-- infraestructura_tag en la mig 060) — la lista vive en region_config como
-- un array de strings, editable sin deploy.
-- ============================================================================

ALTER TABLE public.region_config
  ADD COLUMN IF NOT EXISTS infraestructura_megaproyectos TEXT[] NOT NULL DEFAULT '{}';
