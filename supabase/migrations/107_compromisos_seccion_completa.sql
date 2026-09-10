-- ============================================================================
-- 107_compromisos_seccion_completa.sql
--
-- Un compromiso del Comité Económico se etiqueta con la sección de la que
-- salió. Las opciones eran tres —mesa_empleo, seguimiento_inversion, general—
-- y esa granularidad no alcanza: «Seguimiento de la inversión» es una zona con
-- tres frentes distintos dentro (Proyectos tratados, Oficios, Meta mesa
-- empleo), y un compromiso etiquetado solo como "seguimiento_inversion" no
-- dice de cuál de los tres salió.
--
-- Se agregan `proyectos_tratados` y `oficios`. `seguimiento_inversion` se
-- queda: sirve para el compromiso que abarca la zona entera y no cuelga de un
-- frente puntual, y además es lo que ya tienen guardado los compromisos
-- existentes — reetiquetarlos a ciegas sería inventarles un origen que nadie
-- declaró.
-- ============================================================================

ALTER TABLE public.sesion_compromisos
  DROP CONSTRAINT IF EXISTS sesion_compromisos_seccion_check;

ALTER TABLE public.sesion_compromisos
  ADD CONSTRAINT sesion_compromisos_seccion_check
  CHECK (seccion = ANY (ARRAY[
    'general'::text,
    'seguimiento_inversion'::text,
    'proyectos_tratados'::text,
    'oficios'::text,
    'mesa_empleo'::text
  ]));

COMMENT ON COLUMN public.sesion_compromisos.seccion IS
  'Solo Comité Económico: de qué parte de la sesión salió el compromiso. NULL en Policial/Gabinete, que no tienen secciones.';
