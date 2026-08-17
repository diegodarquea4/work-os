-- ============================================================================
-- 063_tareas_planificacion.sql
--
-- Evoluciona la tabla `tareas` (mig 043) para el tab "Planificación" (antes
-- "Tareas") de la ficha de iniciativa:
--   - `nombre`: título corto de la tarea, distinto de `tarea` (que ahora hace
--     de campo "Descripción"). Se backfillea desde `tarea` truncado para las
--     filas existentes y queda NOT NULL hacia adelante.
--   - `fecha_inicio` / `fecha_termino`: reemplazan a `fecha_vencimiento` — la
--     carta Gantt del tab necesita un rango, no solo una fecha límite.
--     `fecha_termino` hereda el valor de `fecha_vencimiento` para no perder
--     las fechas ya cargadas; `fecha_inicio` queda null (dato que no existía).
-- ============================================================================

ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS nombre TEXT;
ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS fecha_inicio DATE;
ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS fecha_termino DATE;

UPDATE public.tareas SET fecha_termino = fecha_vencimiento
  WHERE fecha_termino IS NULL AND fecha_vencimiento IS NOT NULL;

UPDATE public.tareas SET nombre = LEFT(tarea, 80)
  WHERE nombre IS NULL;

ALTER TABLE public.tareas ALTER COLUMN nombre SET DEFAULT '';
ALTER TABLE public.tareas ALTER COLUMN nombre SET NOT NULL;

DROP INDEX IF EXISTS idx_tareas_lookup;
ALTER TABLE public.tareas DROP COLUMN IF EXISTS fecha_vencimiento;

CREATE INDEX IF NOT EXISTS idx_tareas_lookup
  ON public.tareas(prioridad_id, fecha_termino);
