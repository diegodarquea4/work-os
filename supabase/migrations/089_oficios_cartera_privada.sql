-- ============================================================================
-- 089_oficios_cartera_privada.sql
--
-- Los oficios tratados del Comité Económico (sesion_oficios_tratados,
-- mig 051) referenciaban el proyecto que consideran solo contra el catálogo
-- SEIA legado (proyecto_id → v2_proyectos_inversion). Se amplía con el mismo
-- patrón ya usado en sesion_proyectos (mig 086) y sesion_compromisos (mig
-- 087): puede referenciar un proyecto privado O una iniciativa pública
-- (prioridad_id, ya genérico) en vez de únicamente el catálogo SEIA.
-- ============================================================================

ALTER TABLE public.sesion_oficios_tratados
  ALTER COLUMN proyecto_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS proyecto_privado_id BIGINT REFERENCES public.comite_economico_proyecto(id),
  ADD COLUMN IF NOT EXISTS prioridad_id INT;

ALTER TABLE public.sesion_oficios_tratados
  DROP CONSTRAINT IF EXISTS sesion_oficios_referencia_unica_ck;
ALTER TABLE public.sesion_oficios_tratados
  ADD CONSTRAINT sesion_oficios_referencia_unica_ck CHECK (
    (proyecto_privado_id IS NOT NULL)::int
    + (prioridad_id IS NOT NULL)::int
    + (proyecto_id IS NOT NULL)::int
    = 1
  );
