-- =============================================================================
-- 023_rls_por_rol.sql
--
-- Endurece RLS para que la base imponga la misma matriz de permisos que la
-- UI hoy. Cierra la brecha 5.1 de la auditoría: hasta hoy las policies de
-- escritura sólo exigían sesión (`auth.uid() IS NOT NULL` o
-- `auth.role() = 'authenticated'`), así que un viewer podía mutar cualquier
-- prioridad desde la consola del browser. El control vivía sólo en el
-- cliente.
--
-- Matriz que esta migración codifica (espejo de la UI):
--
--   prioridades_territoriales:
--     INSERT/DELETE      → admin, editor (vía API route con service role)
--     UPDATE estructural → admin, editor (tags, ministerio, prioridad,
--                          inversion, descripción, etc.)
--     UPDATE operativo   → admin, editor, regional (estado_semaforo,
--                          pct_avance, responsable, en_foco, etapa_actual,
--                          proximo_hito, fecha_proximo_hito,
--                          estado_termino_gobierno)
--
--   seguimientos:
--     INSERT             → admin, editor, regional (viewer NO)
--     UPDATE/DELETE      → autor O admin, editor
--
--   documentos_prioridad:
--     INSERT             → admin, editor, regional (viewer NO)
--     DELETE             → subido_por O admin, editor
--
--   metricas_eje:
--     INSERT/DELETE      → admin, editor
--     UPDATE definición  → admin, editor (titulo, descripcion, objetivo,
--                          unidad, eje_id, eje)
--     UPDATE valor_actual→ admin, editor + regional dentro de sus region_cods
--
--   region_ejes:           ya correcta (admin, editor) — mantener.
--   prego_monitoreo:       admin, editor (era authenticated).
--   semaforo_log, desalojo_log:
--                          INSERT admin, editor, regional. Append-only.
--   mop_projects, seia_projects, regional_metrics:
--                          REVOKE client write policies (`USING (true)`).
--                          Solo service role muta vía syncs.
--   SELECT policies:       NO se tocan en esta migración (cambiarlas podría
--                          romper lecturas). Documentado como deuda.
--
-- Diseño:
--   - Función SECURITY DEFINER `current_user_role()` resuelve el rol sin
--     recursión de RLS.
--   - Para restricciones POR COLUMNA (que RLS no soporta nativamente),
--     usamos triggers BEFORE UPDATE en prioridades_territoriales y
--     metricas_eje.
--   - Las policies viejas quedan documentadas como comentarios al final
--     del bloque ROLLBACK para reaplicar si algo se rompe.
--
-- Aplicar manualmente en Supabase SQL Editor. Verificar después con:
--
--   SELECT tablename, policyname, cmd, qual, with_check
--   FROM pg_policies WHERE schemaname = 'public'
--   ORDER BY tablename, cmd;
--
--   SELECT proname FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--   ORDER BY proname;
--
-- Etapa 2 de la consolidación backend.
-- =============================================================================


BEGIN;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helper: current_user_role()
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER para leer user_profiles sin disparar RLS recursivo.
-- STABLE: dentro de una statement, el rol no cambia.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$;

COMMENT ON FUNCTION public.current_user_role() IS
  'Devuelve el rol del usuario autenticado leyendo user_profiles via SECURITY DEFINER. NULL si no hay sesión o el perfil no existe. Usada en políticas RLS para evitar recursión.';

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger: prioridades_territoriales — regional solo columnas operativas
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS permitirá UPDATE a admin, editor y regional. Este trigger restringe
-- a regional a las columnas operativas (las que `canEditOperational` gatea
-- hoy en la UI). admin/editor pasan sin restricción.

CREATE OR REPLACE FUNCTION public.prioridades_check_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ur text;
BEGIN
  ur := public.current_user_role();

  -- service_role (cron, API admin) salta RLS y triggers — no llegaría acá.
  -- admin/editor: cualquier cambio.
  IF ur IN ('admin', 'editor') THEN
    RETURN NEW;
  END IF;

  -- regional: solo puede tocar columnas operativas.
  -- Lista enumerada (whitelist). Cualquier cambio fuera es rechazado.
  IF ur = 'regional' THEN
    IF NEW.region            IS DISTINCT FROM OLD.region            OR
       NEW.cod               IS DISTINCT FROM OLD.cod               OR
       NEW.capital           IS DISTINCT FROM OLD.capital           OR
       NEW.zona              IS DISTINCT FROM OLD.zona              OR
       NEW.eje               IS DISTINCT FROM OLD.eje               OR
       NEW.eje_id            IS DISTINCT FROM OLD.eje_id            OR
       NEW.eje_gobierno      IS DISTINCT FROM OLD.eje_gobierno      OR
       NEW.nombre            IS DISTINCT FROM OLD.nombre            OR
       NEW.ministerio        IS DISTINCT FROM OLD.ministerio        OR
       NEW.prioridad         IS DISTINCT FROM OLD.prioridad         OR
       NEW.descripcion       IS DISTINCT FROM OLD.descripcion       OR
       NEW.codigo_iniciativa IS DISTINCT FROM OLD.codigo_iniciativa OR
       NEW.codigo_bip        IS DISTINCT FROM OLD.codigo_bip        OR
       NEW.inversion_mm      IS DISTINCT FROM OLD.inversion_mm      OR
       NEW.fuente_financiamiento IS DISTINCT FROM OLD.fuente_financiamiento OR
       NEW.tags              IS DISTINCT FROM OLD.tags              OR
       NEW.es_desalojo       IS DISTINCT FROM OLD.es_desalojo       OR
       NEW.comuna            IS DISTINCT FROM OLD.comuna            OR
       NEW.rat               IS DISTINCT FROM OLD.rat               OR
       NEW.origen            IS DISTINCT FROM OLD.origen            OR
       NEW.n                 IS DISTINCT FROM OLD.n                 OR
       NEW.id                IS DISTINCT FROM OLD.id                THEN
      RAISE EXCEPTION 'regional solo puede modificar campos operativos en prioridades_territoriales (estado_semaforo, pct_avance, responsable, en_foco, etapa, próximo hito, fecha hito, estado término)'
        USING ERRCODE = '42501';  -- insufficient_privilege
    END IF;
    RETURN NEW;
  END IF;

  -- viewer u otro: bloqueado por RLS antes, pero defensa extra.
  RAISE EXCEPTION 'rol % no puede modificar prioridades_territoriales', COALESCE(ur, 'sin sesión')
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS prioridades_check_update_trg ON public.prioridades_territoriales;

CREATE TRIGGER prioridades_check_update_trg
BEFORE UPDATE ON public.prioridades_territoriales
FOR EACH ROW
EXECUTE FUNCTION public.prioridades_check_update();


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger: metricas_eje — regional solo valor_actual + dentro de región
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS permitirá UPDATE a admin, editor y regional. Este trigger restringe
-- a regional a (a) la columna valor_actual + columnas de auditoría
-- relacionadas, y (b) sólo en filas cuya region_cod esté en sus
-- region_cods de user_profiles.

CREATE OR REPLACE FUNCTION public.metricas_eje_check_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ur text;
  user_regions text[];
BEGIN
  ur := public.current_user_role();

  IF ur IN ('admin', 'editor') THEN
    RETURN NEW;
  END IF;

  IF ur = 'regional' THEN
    -- Cargar region_cods del usuario.
    SELECT region_cods INTO user_regions
    FROM public.user_profiles WHERE id = auth.uid();

    -- region_cods NULL o vacío → no puede modificar nada.
    IF user_regions IS NULL OR array_length(user_regions, 1) IS NULL THEN
      RAISE EXCEPTION 'regional sin region_cods asignadas no puede modificar metricas_eje'
        USING ERRCODE = '42501';
    END IF;

    -- La fila debe estar en una de sus regiones.
    IF NOT (OLD.region_cod = ANY(user_regions)) THEN
      RAISE EXCEPTION 'regional puede modificar valor_actual solo en sus regiones asignadas (%, asignadas: %)',
        OLD.region_cod, array_to_string(user_regions, ',')
        USING ERRCODE = '42501';
    END IF;

    -- Solo permitir cambios en valor_actual + audit columns.
    IF NEW.titulo            IS DISTINCT FROM OLD.titulo            OR
       NEW.descripcion       IS DISTINCT FROM OLD.descripcion       OR
       NEW.objetivo          IS DISTINCT FROM OLD.objetivo          OR
       NEW.unidad            IS DISTINCT FROM OLD.unidad            OR
       NEW.region_cod        IS DISTINCT FROM OLD.region_cod        OR
       NEW.eje               IS DISTINCT FROM OLD.eje               OR
       NEW.eje_id            IS DISTINCT FROM OLD.eje_id            OR
       NEW.created_at        IS DISTINCT FROM OLD.created_at        OR
       NEW.created_by_email  IS DISTINCT FROM OLD.created_by_email  OR
       NEW.id                IS DISTINCT FROM OLD.id                THEN
      RAISE EXCEPTION 'regional solo puede modificar valor_actual en metricas_eje (la definición la cambia admin/editor)'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'rol % no puede modificar metricas_eje', COALESCE(ur, 'sin sesión')
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS metricas_eje_check_update_trg ON public.metricas_eje;

CREATE TRIGGER metricas_eje_check_update_trg
BEFORE UPDATE ON public.metricas_eje
FOR EACH ROW
EXECUTE FUNCTION public.metricas_eje_check_update();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Policies: prioridades_territoriales
-- ─────────────────────────────────────────────────────────────────────────────
-- Hoy: UPDATE = authenticated_write (cualquier sesión). Reemplazamos.
-- INSERT/DELETE no tienen policy explícita → solo service_role. Lo
-- explicitamos para admin/editor por consistencia (igual la API usa service role).
-- SELECT (Public read, anon_read, read_authenticated) NO se tocan.

DROP POLICY IF EXISTS authenticated_write ON public.prioridades_territoriales;

CREATE POLICY prioridades_update_by_role ON public.prioridades_territoriales
  FOR UPDATE
  USING (public.current_user_role() IN ('admin', 'editor', 'regional'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor', 'regional'));

CREATE POLICY prioridades_insert_by_role ON public.prioridades_territoriales
  FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

CREATE POLICY prioridades_delete_by_role ON public.prioridades_territoriales
  FOR DELETE
  USING (public.current_user_role() IN ('admin', 'editor'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Policies: seguimientos
-- ─────────────────────────────────────────────────────────────────────────────
-- Hoy: INSERT/UPDATE/DELETE = auth.role() = 'authenticated' (viewer incluido).
-- Nuevo: INSERT admin/editor/regional. UPDATE/DELETE autor O admin/editor.

DROP POLICY IF EXISTS seguimientos_insert ON public.seguimientos;
DROP POLICY IF EXISTS seguimientos_update ON public.seguimientos;
DROP POLICY IF EXISTS seguimientos_delete ON public.seguimientos;

CREATE POLICY seguimientos_insert_by_role ON public.seguimientos
  FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'editor', 'regional'));

CREATE POLICY seguimientos_update_owner_or_staff ON public.seguimientos
  FOR UPDATE
  USING (
    autor = auth.jwt() ->> 'email'
    OR public.current_user_role() IN ('admin', 'editor')
  )
  WITH CHECK (
    autor = auth.jwt() ->> 'email'
    OR public.current_user_role() IN ('admin', 'editor')
  );

CREATE POLICY seguimientos_delete_owner_or_staff ON public.seguimientos
  FOR DELETE
  USING (
    autor = auth.jwt() ->> 'email'
    OR public.current_user_role() IN ('admin', 'editor')
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Policies: documentos_prioridad
-- ─────────────────────────────────────────────────────────────────────────────
-- Hoy: INSERT/UPDATE/DELETE = auth.role() = 'authenticated'.
-- Nuevo: INSERT admin/editor/regional. DELETE subido_por O admin/editor.
-- UPDATE: en el código actual no se hace (documentos son inmutables), pero
-- dejamos la policy a admin/editor por defensa.

DROP POLICY IF EXISTS documentos_insert ON public.documentos_prioridad;
DROP POLICY IF EXISTS documentos_update ON public.documentos_prioridad;
DROP POLICY IF EXISTS documentos_delete ON public.documentos_prioridad;

CREATE POLICY documentos_insert_by_role ON public.documentos_prioridad
  FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'editor', 'regional'));

CREATE POLICY documentos_update_by_staff ON public.documentos_prioridad
  FOR UPDATE
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

CREATE POLICY documentos_delete_owner_or_staff ON public.documentos_prioridad
  FOR DELETE
  USING (
    subido_por = auth.jwt() ->> 'email'
    OR public.current_user_role() IN ('admin', 'editor')
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Policies: metricas_eje
-- ─────────────────────────────────────────────────────────────────────────────
-- Hoy: INSERT/DELETE = admin/editor (ok). UPDATE = authenticated (brecha).
-- Nuevo: UPDATE permite admin/editor/regional. El trigger restringe regional
-- a valor_actual + región.

DROP POLICY IF EXISTS metricas_update ON public.metricas_eje;

CREATE POLICY metricas_update_by_role ON public.metricas_eje
  FOR UPDATE
  USING (public.current_user_role() IN ('admin', 'editor', 'regional'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor', 'regional'));

-- metricas_insert y metricas_delete ya son admin/editor (migración 014) → mantener.


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Policies: prego_monitoreo
-- ─────────────────────────────────────────────────────────────────────────────
-- Hoy: write_authed = auth.role() = 'authenticated' (FOR ALL).
-- Nuevo: admin/editor (la UI ya lo gatea).

DROP POLICY IF EXISTS write_authed ON public.prego_monitoreo;

CREATE POLICY prego_monitoreo_write_by_role ON public.prego_monitoreo
  FOR ALL
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Policies: semaforo_log, desalojo_log (append-only audit)
-- ─────────────────────────────────────────────────────────────────────────────
-- Hoy: semaforo_log INSERT = auth.role() = 'authenticated'.
--      desalojo_log ALL = admin (correcto, no se toca).
-- Nuevo: semaforo_log INSERT permite a quien puede modificar la cosa logueada:
--        admin, editor, regional (los que pueden cambiar pct/semáforo).

DROP POLICY IF EXISTS semaforo_log_insert ON public.semaforo_log;

CREATE POLICY semaforo_log_insert_by_role ON public.semaforo_log
  FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'editor', 'regional'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Endurecer mop_projects, seia_projects, regional_metrics
-- ─────────────────────────────────────────────────────────────────────────────
-- Hoy tienen 'Auth upsert' / 'Auth update' con USING (true) → cualquier
-- autenticado puede mutar via consola. NO es superficie de cliente (sólo
-- los crons las llenan vía service role), pero es brecha latente.
-- Las quitamos. El service_role salta RLS, así los crons siguen funcionando.

DROP POLICY IF EXISTS "Auth upsert"  ON public.mop_projects;
DROP POLICY IF EXISTS "Auth update"  ON public.mop_projects;
DROP POLICY IF EXISTS "Auth upsert"  ON public.seia_projects;
DROP POLICY IF EXISTS "Auth update"  ON public.seia_projects;
DROP POLICY IF EXISTS "Auth insert"  ON public.regional_metrics;
DROP POLICY IF EXISTS "Auth update"  ON public.regional_metrics;

-- SELECT policies se mantienen — son lecturas legítimas desde la app.


COMMIT;


-- ============================================================================
-- ROLLBACK
-- ----------------------------------------------------------------------------
-- Si algo se rompe, ejecutar el siguiente bloque para restaurar el estado
-- anterior. Estas son las policies y triggers PRE-023 reconstruidas desde
-- pg_policies del 2026-06-11 (ver supabase/schema-baseline.sql).
--
-- BEGIN;
--
-- -- 1. Reabrir prioridades_territoriales a cualquier sesión.
-- DROP POLICY IF EXISTS prioridades_update_by_role ON public.prioridades_territoriales;
-- DROP POLICY IF EXISTS prioridades_insert_by_role ON public.prioridades_territoriales;
-- DROP POLICY IF EXISTS prioridades_delete_by_role ON public.prioridades_territoriales;
-- DROP TRIGGER IF EXISTS prioridades_check_update_trg ON public.prioridades_territoriales;
-- CREATE POLICY authenticated_write ON public.prioridades_territoriales
--   FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
--
-- -- 2. Restaurar seguimientos a authenticated.
-- DROP POLICY IF EXISTS seguimientos_insert_by_role ON public.seguimientos;
-- DROP POLICY IF EXISTS seguimientos_update_owner_or_staff ON public.seguimientos;
-- DROP POLICY IF EXISTS seguimientos_delete_owner_or_staff ON public.seguimientos;
-- CREATE POLICY seguimientos_insert ON public.seguimientos
--   FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY seguimientos_update ON public.seguimientos
--   FOR UPDATE USING (auth.role() = 'authenticated');
-- CREATE POLICY seguimientos_delete ON public.seguimientos
--   FOR DELETE USING (auth.role() = 'authenticated');
--
-- -- 3. documentos_prioridad.
-- DROP POLICY IF EXISTS documentos_insert_by_role ON public.documentos_prioridad;
-- DROP POLICY IF EXISTS documentos_update_by_staff ON public.documentos_prioridad;
-- DROP POLICY IF EXISTS documentos_delete_owner_or_staff ON public.documentos_prioridad;
-- CREATE POLICY documentos_insert ON public.documentos_prioridad
--   FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY documentos_update ON public.documentos_prioridad
--   FOR UPDATE USING (auth.role() = 'authenticated');
-- CREATE POLICY documentos_delete ON public.documentos_prioridad
--   FOR DELETE USING (auth.role() = 'authenticated');
--
-- -- 4. metricas_eje.
-- DROP POLICY IF EXISTS metricas_update_by_role ON public.metricas_eje;
-- DROP TRIGGER IF EXISTS metricas_eje_check_update_trg ON public.metricas_eje;
-- CREATE POLICY metricas_update ON public.metricas_eje
--   FOR UPDATE USING (auth.role() = 'authenticated');
--
-- -- 5. prego_monitoreo.
-- DROP POLICY IF EXISTS prego_monitoreo_write_by_role ON public.prego_monitoreo;
-- CREATE POLICY write_authed ON public.prego_monitoreo
--   FOR ALL USING (auth.role() = 'authenticated');
--
-- -- 6. semaforo_log.
-- DROP POLICY IF EXISTS semaforo_log_insert_by_role ON public.semaforo_log;
-- CREATE POLICY semaforo_log_insert ON public.semaforo_log
--   FOR INSERT WITH CHECK (auth.role() = 'authenticated');
--
-- -- 7. Reabrir mop_projects, seia_projects, regional_metrics.
-- CREATE POLICY "Auth upsert" ON public.mop_projects
--   FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Auth update" ON public.mop_projects
--   FOR UPDATE USING (true);
-- CREATE POLICY "Auth upsert" ON public.seia_projects
--   FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Auth update" ON public.seia_projects
--   FOR UPDATE USING (true);
-- CREATE POLICY "Auth insert" ON public.regional_metrics
--   FOR INSERT WITH CHECK (true);
-- CREATE POLICY "Auth update" ON public.regional_metrics
--   FOR UPDATE USING (true);
--
-- -- 8. Borrar la función helper (último, porque las policies la referencian).
-- DROP FUNCTION IF EXISTS public.current_user_role();
-- DROP FUNCTION IF EXISTS public.prioridades_check_update();
-- DROP FUNCTION IF EXISTS public.metricas_eje_check_update();
--
-- COMMIT;
-- ============================================================================
