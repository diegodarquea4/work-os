-- ============================================================================
-- 064_tareas_region_scope_interino.sql
--
-- Endurecimiento INTERINO de permisos destapado por el PR de Planificación /
-- Comité de Infraestructura (mig 060-063). Cierra dos huecos ANTES del rollout
-- del plan de capas de usuarios (que reescribirá esto a current_user_can).
-- Alcance acotado y quirúrgico — no toca el modelo de roles vigente:
--
--   R1 (crítico) — `tareas` era world-readable e insertable por cualquier
--     autenticado, SIN scope regional (mig 043). El PR la promovió de
--     "pendientes sueltos" a módulo de Planificación con carta Gantt (nombre,
--     fechas, responsable de iniciativas de TODAS las regiones): un regional de
--     una región leía/creaba la planificación de otra, y un viewer la del país
--     entero. Se scopea por región derivando la región de la iniciativa vía
--     tareas.prioridad_id → prioridades_territoriales.n → .cod. Staff
--     (admin/editor) mantiene acceso total; regional/viewer quedan acotados a
--     sus region_cods (SELECT/INSERT) y, además, autor de la tarea para
--     UPDATE/DELETE (regla "mío vs ajeno" de mig 043).
--
--   R2 (medio) — `region_config` es escribible por el rol regional en su propia
--     fila (mig 046) sin candado por columna. El PR sumó columnas definicionales
--     sensibles (infraestructura_habilitado/tag/nombre) que un regional NO
--     debería tocar (auto-habilitarse el comité, redefinir el tag). Trigger
--     BEFORE UPDATE que se las bloquea al rol regional; le deja
--     infraestructura_megaproyectos (curaduría operativa vía MegaproyectosModal).
--
-- R3 (bajo, /api/tarea-gantt-pdf sin gate de rol) se cierra en el route, no acá.
--
-- Deuda conocida: `n` NO es UNIQUE (CLAUDE.md) — si dos iniciativas comparten n
-- el EXISTS es permisivo si CUALQUIERA cae en la región del usuario. De-facto n
-- es único; el plan de capas migrará estas FKs lógicas a id. Índice en n para
-- que el join del RLS no seq-scanee prioridades.
-- ============================================================================

-- ── R1: scope regional de `tareas` ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_prioridades_n
  ON public.prioridades_territoriales (n);

ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;

-- Fuera las policies world-readable / insert-any de mig 043.
DROP POLICY IF EXISTS tareas_select ON public.tareas;
DROP POLICY IF EXISTS tareas_insert_any_authenticated ON public.tareas;
DROP POLICY IF EXISTS tareas_update_owner_or_staff ON public.tareas;
DROP POLICY IF EXISTS tareas_delete_owner_or_staff ON public.tareas;

-- Staff (admin/editor): acceso total (calco de *_staff_all de mig 044).
DROP POLICY IF EXISTS tareas_staff_all ON public.tareas;
CREATE POLICY tareas_staff_all ON public.tareas
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- No-staff SELECT: acotado a la región de la iniciativa. La región de la tarea
-- = prioridades_territoriales.cod de la fila cuyo n = tareas.prioridad_id.
DROP POLICY IF EXISTS tareas_region_select ON public.tareas;
CREATE POLICY tareas_region_select ON public.tareas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.prioridades_territoriales p, public.user_profiles up
    WHERE up.id = auth.uid()
      AND p.n = tareas.prioridad_id
      AND p.cod = ANY(up.region_cods)));

-- No-staff INSERT: solo tareas sobre iniciativas de sus regiones.
DROP POLICY IF EXISTS tareas_region_insert ON public.tareas;
CREATE POLICY tareas_region_insert ON public.tareas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.prioridades_territoriales p, public.user_profiles up
    WHERE up.id = auth.uid()
      AND p.n = tareas.prioridad_id
      AND p.cod = ANY(up.region_cods)));

-- No-staff UPDATE/DELETE: además autor de la tarea.
DROP POLICY IF EXISTS tareas_region_update ON public.tareas;
CREATE POLICY tareas_region_update ON public.tareas
  FOR UPDATE TO authenticated
  USING (
    tareas.autor = auth.jwt() ->> 'email'
    AND EXISTS (
      SELECT 1 FROM public.prioridades_territoriales p, public.user_profiles up
      WHERE up.id = auth.uid()
        AND p.n = tareas.prioridad_id
        AND p.cod = ANY(up.region_cods)))
  WITH CHECK (
    tareas.autor = auth.jwt() ->> 'email'
    AND EXISTS (
      SELECT 1 FROM public.prioridades_territoriales p, public.user_profiles up
      WHERE up.id = auth.uid()
        AND p.n = tareas.prioridad_id
        AND p.cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS tareas_region_delete ON public.tareas;
CREATE POLICY tareas_region_delete ON public.tareas
  FOR DELETE TO authenticated
  USING (
    tareas.autor = auth.jwt() ->> 'email'
    AND EXISTS (
      SELECT 1 FROM public.prioridades_territoriales p, public.user_profiles up
      WHERE up.id = auth.uid()
        AND p.n = tareas.prioridad_id
        AND p.cod = ANY(up.region_cods)));

-- ── R2: candado por columna en `region_config` (config del comité) ──────────
-- region_config sigue con SELECT any-auth + UPDATE staff/regional-su-región
-- (mig 046). Este trigger solo impide que el rol REGIONAL cambie las columnas
-- definicionales del Comité de Infraestructura; le deja
-- infraestructura_megaproyectos (curaduría operativa). Blocklist mínima: no
-- altera el comportamiento de ningún otro rol ni de ninguna otra columna.
CREATE OR REPLACE FUNCTION public.region_config_check_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Service role (crons, rutas API) no tiene auth.uid(): bypass.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.current_user_role() = 'regional' THEN
    IF NEW.infraestructura_habilitado IS DISTINCT FROM OLD.infraestructura_habilitado OR
       NEW.infraestructura_tag        IS DISTINCT FROM OLD.infraestructura_tag        OR
       NEW.infraestructura_nombre     IS DISTINCT FROM OLD.infraestructura_nombre     THEN
      RAISE EXCEPTION 'regional no puede modificar la configuración del comité (infraestructura_habilitado/tag/nombre) en region_config'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS region_config_check_update_trg ON public.region_config;
CREATE TRIGGER region_config_check_update_trg
BEFORE UPDATE ON public.region_config
FOR EACH ROW EXECUTE FUNCTION public.region_config_check_update();
