-- 119_cartera_expediente_seia.sql
--
-- Qué expediente del SEIA le corresponde a un proyecto de la cartera, para
-- que sus oficios pendientes se le peguen solos.
--
-- ── Por qué no se reusa `origen_id` ─────────────────────────────────────────
--
-- `origen_sistema` + `origen_id` (mig 106) significan «este proyecto SE IMPORTÓ
-- del catálogo», y la reconciliación de la mig 109 los usa como permiso para
-- pisar nombre, titular, estado e inversión con lo que diga la fuente. Llenar
-- esa columna a mano para enganchar oficios traería esa consecuencia de
-- arrastre: alguien vincula un expediente y, sin pedirlo, empieza a perder los
-- datos que cargó.
--
-- Son dos afirmaciones distintas:
--   origen_id          → «esto vino de allá, y allá manda»
--   seia_expediente_id → «esto es lo mismo que aquel expediente»
--
-- La segunda es la que hace falta para los oficios, y no implica la primera.
-- Un proyecto importado tiene las dos y calza por cualquiera de ellas.
--
-- Idempotente.

ALTER TABLE public.comite_economico_proyecto
  ADD COLUMN IF NOT EXISTS seia_expediente_id BIGINT;

COMMENT ON COLUMN public.comite_economico_proyecto.seia_expediente_id IS
  'Expediente del SEIA al que corresponde este proyecto, cargado a mano desde la '
  'ficha. Sirve para que sus oficios pendientes se le peguen solos. NO implica que '
  'el proyecto se haya importado del catálogo (eso es origen_sistema/origen_id) ni '
  'habilita la reconciliación de la mig 109.';

-- El cruce contra los oficios va por esta columna, y es el camino caliente de
-- cada importación.
CREATE INDEX IF NOT EXISTS idx_comite_economico_proyecto_expediente
  ON public.comite_economico_proyecto (seia_expediente_id)
  WHERE seia_expediente_id IS NOT NULL;

-- Sin RLS nueva: las policies de la mig 094 son por fila
-- (`current_user_can('comite.economico.operar', region_cod)`), no por columna.
