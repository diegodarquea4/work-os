-- ============================================================================
-- 081_seguimiento_hito_reunion.sql   (renumerada desde 074 al integrar con backlog+gabinete v2)
--
-- Evoluciona `seguimientos` (tab Seguimiento de la ficha de iniciativa) para
-- que Hito y Reunión dejen de compartir el mismo molde genérico que Avance/
-- Alerta:
--   - `nombre`: título del hito (o de la reunión, opcional).
--   - `hora` / `lugar`: propios del hito — ambos opcionales (solo `fecha`,
--     que ya existía, sigue siendo obligatoria).
--   - `notas`: propio de la reunión (descripcion pasa a significar "temas
--     tratados" para tipo='reunion' — no hace falta una columna nueva).
--   - `asistentes`: JSONB compartido por hito/reunión — lista de
--     { nombre, institucion, email } donde `email` es NULL si la persona no
--     está linkeada a un usuario del sistema (mismo patrón de "select región
--     + Otro" que Responsable en Planificación, mig 063).
--   - `derivado_gabinete_tema_id`: si no es NULL, este seguimiento (avance/
--     hito/reunión) ya fue derivado como "tema a tratar" a Gabinete Regional
--     (gabinete_temas, mig 053). Alcance v1: solo Gabinete — los demás
--     comités quedan para una iteración futura (no tienen hoy una sección
--     "Temas a tratar" en su modal de sesión).
--
-- `seguimiento_compromisos`: compromisos tomados en una reunión (responsable/
-- plazo/estado) — tabla nueva y liviana, aislada del esquema de sesiones de
-- comité (`sesion_compromisos`) que usan 5 módulos distintos y no admite hoy
-- un origen fuera de una sesión real. `prioridad_id` queda denormalizado
-- (mismo patrón que seguimientos/tareas/documentos: FK lógica a
-- prioridades_territoriales.n) para poder leer/filtrar sin doble join.
-- ============================================================================

ALTER TABLE public.seguimientos ADD COLUMN IF NOT EXISTS nombre TEXT;
ALTER TABLE public.seguimientos ADD COLUMN IF NOT EXISTS hora TIME;
ALTER TABLE public.seguimientos ADD COLUMN IF NOT EXISTS lugar TEXT;
ALTER TABLE public.seguimientos ADD COLUMN IF NOT EXISTS notas TEXT;
ALTER TABLE public.seguimientos ADD COLUMN IF NOT EXISTS asistentes JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.seguimientos ADD COLUMN IF NOT EXISTS derivado_gabinete_tema_id BIGINT
  REFERENCES public.gabinete_temas(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.seguimiento_compromisos (
  id                       BIGSERIAL   PRIMARY KEY,
  seguimiento_id           BIGINT      NOT NULL REFERENCES public.seguimientos(id) ON DELETE CASCADE,
  prioridad_id             INT         NOT NULL,
  descripcion              TEXT        NOT NULL,
  responsable_nombre       TEXT,
  responsable_institucion  TEXT,
  plazo                    DATE,
  estado                   TEXT        NOT NULL DEFAULT 'pendiente'
                               CHECK (estado IN ('pendiente', 'en_curso', 'cumplido')),
  autor                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_compromisos_seguimiento
  ON public.seguimiento_compromisos(seguimiento_id);
CREATE INDEX IF NOT EXISTS idx_seguimiento_compromisos_prioridad
  ON public.seguimiento_compromisos(prioridad_id);

ALTER TABLE public.seguimiento_compromisos ENABLE ROW LEVEL SECURITY;

-- SELECT: mismo scope regional que seguimientos (mig 072).
DROP POLICY IF EXISTS seguimiento_compromisos_read ON public.seguimiento_compromisos;
CREATE POLICY seguimiento_compromisos_read ON public.seguimiento_compromisos
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.prioridades_territoriales p
    WHERE p.n = seguimiento_compromisos.prioridad_id
      AND public.current_user_sees_region(p.cod)));

-- INSERT: cualquier autenticado (mismo criterio abierto que seguimientos, mig 026).
DROP POLICY IF EXISTS seguimiento_compromisos_insert_any_authenticated ON public.seguimiento_compromisos;
CREATE POLICY seguimiento_compromisos_insert_any_authenticated ON public.seguimiento_compromisos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE/DELETE: autor propio o capacidad iniciativa.gestionar_ajeno (mismo
-- patrón que seguimientos, mig 069).
DROP POLICY IF EXISTS seguimiento_compromisos_update_owner_or_staff ON public.seguimiento_compromisos;
CREATE POLICY seguimiento_compromisos_update_owner_or_staff ON public.seguimiento_compromisos
  FOR UPDATE TO public
  USING (autor = (auth.jwt() ->> 'email') OR public.current_user_can('iniciativa.gestionar_ajeno'))
  WITH CHECK (autor = (auth.jwt() ->> 'email') OR public.current_user_can('iniciativa.gestionar_ajeno'));

DROP POLICY IF EXISTS seguimiento_compromisos_delete_owner_or_staff ON public.seguimiento_compromisos;
CREATE POLICY seguimiento_compromisos_delete_owner_or_staff ON public.seguimiento_compromisos
  FOR DELETE TO public
  USING (autor = (auth.jwt() ->> 'email') OR public.current_user_can('iniciativa.gestionar_ajeno'));
