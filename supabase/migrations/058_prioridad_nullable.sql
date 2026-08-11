-- ============================================================================
-- 058_prioridad_nullable.sql
--
-- Jubilación del campo `prioridad` (Alta/Media/Baja): el panel se casa con
-- `capa` (I/II/III) como único nivel de importancia (decisión 2026-08-11). El
-- app deja de leer/escribir `prioridad`, así que se relaja el NOT NULL para que
-- los INSERT nuevos (import) no lo requieran; quedan con prioridad = NULL.
--
-- NO destructiva: la columna queda DORMIDA con su data intacta (~7k valores
-- Alta/Media/Baja) como referencia. El CHECK `prioridad IN (...)` admite NULL.
-- El trigger prioridades_check_update (mig 045) sigue referenciando la columna
-- existente → NO se toca.
--
-- Diferido (migración aparte, tras confirmar): DROP COLUMN prioridad + CHECK +
-- trigger sucesor sin la línea de prioridad.
-- ============================================================================

ALTER TABLE public.prioridades_territoriales
  ALTER COLUMN prioridad DROP NOT NULL;
