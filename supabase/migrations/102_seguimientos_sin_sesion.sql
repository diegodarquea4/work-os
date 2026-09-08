-- ============================================================================
-- 102_seguimientos_sin_sesion.sql
--
-- Revierte la mitad pública de la mig 101. Esa migración agregó `sesion_id` a
-- `seguimientos` anticipando que el acta reportara también los avances de las
-- iniciativas públicas tratadas en la sesión. La decisión de producto fue la
-- contraria: en el acta, una iniciativa pública figura solo como tratada en la
-- sesión, sin detalle de avances.
--
-- Con eso, la columna queda sin nadie que la escriba: esquema muerto que
-- además invita a creer que el vínculo existe. Se saca mientras está vacía
-- (nunca llegó a escribirse una fila) y sin costo.
--
-- `comite_economico_proyecto_seguimiento.sesion_id` NO se toca: ahí el vínculo
-- sí se usa — es lo que hace que los avances de un proyecto privado salgan en
-- el acta de su sesión.
-- ============================================================================

DROP INDEX IF EXISTS public.idx_seguimientos_sesion;

ALTER TABLE public.seguimientos
  DROP COLUMN IF EXISTS sesion_id;
