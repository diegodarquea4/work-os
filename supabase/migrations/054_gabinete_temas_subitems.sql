-- ============================================================================
-- 054_gabinete_temas_subitems.sql
--
-- Sub-items de los "Temas a tratar" del Gabinete (pedido Diego 2026-08-05):
-- puntos secundarios bajo cada tema (detalle de una vocería, subtemas de un
-- punto general). Array de strings en JSONB en la MISMA fila — igual que el
-- `desglose` de sesion_comite_valor (mig 048): los sub-items se leen y
-- escriben siempre junto al tema padre, nunca se consultan solos, así que
-- una tabla hija sería sobre-ingeniería (RLS y policies extra sin beneficio).
-- Las policies de mig 053 cubren la columna nueva sin cambios.
-- ============================================================================

ALTER TABLE public.gabinete_temas
  ADD COLUMN IF NOT EXISTS subitems JSONB NOT NULL DEFAULT '[]'::jsonb;
