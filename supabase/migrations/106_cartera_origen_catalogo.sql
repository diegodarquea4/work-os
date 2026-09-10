-- ============================================================================
-- 106_cartera_origen_catalogo.sql
--
-- La cartera del Comité Económico (`comite_economico_proyecto`, mig 094) se
-- llena a mano y **el sync no la toca nunca**: es de las personas. Pero cargar
-- a mano un proyecto que el catálogo ya conoce es transcribir datos que la
-- base tiene — nombre, titular, inversión, estado.
--
-- Estas columnas registran de dónde salió un proyecto cuando se importó desde
-- el catálogo unificado (`v2_proyectos_inversion`, que alimentan el sync del
-- SEIA y los demás). Habilitan tres cosas:
--
--   1. No duplicar: el importador esconde lo que la región ya tiene.
--   2. Contrastar: el catálogo dice "Aprobado" hoy y el proyecto se importó
--      cuando decía "En Calificación" → la ficha lo puede avisar. Es lo que
--      hace útil volver a correr el sync, más allá de sumar proyectos nuevos.
--   3. Volver a la fuente: el expediente en el SEIA, sin buscarlo a mano.
--
-- **Referencia blanda, sin FOREIGN KEY, a propósito.** Un proyecto de la
-- cartera no puede desaparecer ni quedar bloqueado porque el catálogo cambie
-- de forma: una vez importado es un proyecto del comité y se sostiene solo.
-- Mismo criterio que `seguimientos.prioridad_id` (mig 081).
--
-- `origen_sistema` queda libre (no CHECK) porque el catálogo es multi-fuente
-- por diseño y va a sumar orígenes — 'seia' hoy, 'mop' y los que vengan.
-- NULL en las tres = proyecto cargado a mano, que sigue siendo el caso normal.
-- ============================================================================

ALTER TABLE public.comite_economico_proyecto
  ADD COLUMN IF NOT EXISTS origen_sistema TEXT,
  ADD COLUMN IF NOT EXISTS origen_id TEXT,
  ADD COLUMN IF NOT EXISTS origen_importado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origen_estado_al_importar TEXT;

COMMENT ON COLUMN public.comite_economico_proyecto.origen_sistema IS
  'Sistema del catálogo desde el que se importó (v2_proyectos_inversion.sistema_origen): ''seia'', ''mop''… NULL = cargado a mano.';
COMMENT ON COLUMN public.comite_economico_proyecto.origen_id IS
  'Id en v2_proyectos_inversion (ej. ''seia_2160500180''). Referencia blanda, sin FK: la cartera sobrevive a cualquier cambio del catálogo.';
COMMENT ON COLUMN public.comite_economico_proyecto.origen_estado_al_importar IS
  'Estado que tenía en el catálogo al importarlo. Comparado con el estado actual del catálogo, delata que el proyecto avanzó.';

-- Un mismo expediente no se importa dos veces en la misma región. Parcial:
-- los proyectos cargados a mano (origen_id NULL) no compiten entre sí.
CREATE UNIQUE INDEX IF NOT EXISTS idx_comite_economico_proyecto_origen
  ON public.comite_economico_proyecto (region_cod, origen_id)
  WHERE origen_id IS NOT NULL;
