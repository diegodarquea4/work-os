-- ============================================================================
-- 109_cartera_reconciliacion.sql
--
-- Hasta acá la cartera se enteraba de un cambio en la fuente solo por el
-- estado, solo comparando contra el momento de importar, y solo si alguien
-- abría la ficha. Un titular que cambia de razón social o una inversión que se
-- corrige pasaban en silencio.
--
-- Ahora la reconciliación es automática y deja rastro. Dos columnas:
--
-- `origen_snapshot` — los valores de la fuente en la ÚLTIMA reconciliación, no
-- en la importación. Es contra esto que se compara: si se comparara siempre
-- contra el momento de importar, un cambio ya registrado se volvería a
-- reportar en cada corrida.
--
-- `automatico` en la bitácora — distingue lo que escribió el sistema de lo que
-- escribió una persona. Importa para tres cosas: la ficha los muestra
-- distinto, no se pueden editar como un avance propio, y el acta puede
-- decidir si los incluye.
--
-- OJO — esto cambia una regla anterior: el sync ahora SÍ escribe en
-- `comite_economico_proyecto`, cosa que la mig 106 decía que nunca haría. El
-- cambio es acotado y deliberado: solo toca campos que siguen calzando con el
-- snapshot, o sea que nadie editó a mano. Un campo corregido por una persona
-- no se pisa nunca — se reporta el cambio de la fuente y se deja la decisión
-- en quien lleva la ficha.
-- ============================================================================

ALTER TABLE public.comite_economico_proyecto
  ADD COLUMN IF NOT EXISTS origen_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS origen_reconciliado_at TIMESTAMPTZ;

COMMENT ON COLUMN public.comite_economico_proyecto.origen_snapshot IS
  'Valores de la fuente (nombre, titular, estado, inversion) en la última reconciliación. Contra esto se comparan las corridas siguientes.';
COMMENT ON COLUMN public.comite_economico_proyecto.origen_reconciliado_at IS
  'Cuándo se contrastó por última vez contra el catálogo. NULL = importado antes de que existiera la reconciliación.';

ALTER TABLE public.comite_economico_proyecto_seguimiento
  ADD COLUMN IF NOT EXISTS automatico BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.comite_economico_proyecto_seguimiento.automatico IS
  'true = lo escribió la reconciliación con el catálogo, no una persona. No editable desde la ficha.';

CREATE INDEX IF NOT EXISTS idx_comite_economico_seguimiento_automatico
  ON public.comite_economico_proyecto_seguimiento (proyecto_id, automatico);

-- Un avance automático no tiene autor humano, así que las políticas de
-- edición por `autor = email` no le aplican. Se cierra explícitamente: nadie
-- edita ni borra el rastro de una reconciliación desde la app.
DROP POLICY IF EXISTS comite_economico_seguimiento_update ON public.comite_economico_proyecto_seguimiento;
CREATE POLICY comite_economico_seguimiento_update ON public.comite_economico_proyecto_seguimiento
  FOR UPDATE TO authenticated
  USING (
    automatico = false
    AND (
      autor = (auth.jwt() ->> 'email')
      OR EXISTS (
        SELECT 1 FROM public.comite_economico_proyecto p
        WHERE p.id = comite_economico_proyecto_seguimiento.proyecto_id
          AND public.current_user_can('comite.economico.operar', p.region_cod))))
  WITH CHECK (
    automatico = false
    AND (
      autor = (auth.jwt() ->> 'email')
      OR EXISTS (
        SELECT 1 FROM public.comite_economico_proyecto p
        WHERE p.id = comite_economico_proyecto_seguimiento.proyecto_id
          AND public.current_user_can('comite.economico.operar', p.region_cod))));

-- Mismo criterio para el borrado: el rastro de una reconciliación no se borra
-- desde la app. Si un avance automático sobra, sobra el proyecto entero —y ese
-- sí se puede sacar de la cartera, arrastrándolo por CASCADE.
DROP POLICY IF EXISTS comite_economico_seguimiento_delete ON public.comite_economico_proyecto_seguimiento;
CREATE POLICY comite_economico_seguimiento_delete ON public.comite_economico_proyecto_seguimiento
  FOR DELETE TO authenticated
  USING (
    automatico = false
    AND (
      autor = (auth.jwt() ->> 'email')
      OR EXISTS (
        SELECT 1 FROM public.comite_economico_proyecto p
        WHERE p.id = comite_economico_proyecto_seguimiento.proyecto_id
          AND public.current_user_can('comite.economico.operar', p.region_cod))));
