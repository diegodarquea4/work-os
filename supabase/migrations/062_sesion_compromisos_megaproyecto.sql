-- ============================================================================
-- 062_sesion_compromisos_megaproyecto.sql
--
-- Un compromiso del Comité de Infraestructura puede declarar a qué
-- megaproyecto pertenece (mig 061) — independiente de si está vinculado a
-- una iniciativa puntual (prioridad_id): un compromiso general de "Puerto de
-- Arica" no siempre cuelga de una sola iniciativa de la cartera.
--
-- Texto libre (igual criterio que infraestructura_tag/seccion, mig
-- 052/057/058): no hay FK a un catálogo, el valor es uno de los tags
-- curados en region_config.infraestructura_megaproyectos al momento de
-- crear el compromiso. NULL para compromisos de otras instancias.
-- ============================================================================

ALTER TABLE public.sesion_compromisos
  ADD COLUMN IF NOT EXISTS megaproyecto TEXT;
