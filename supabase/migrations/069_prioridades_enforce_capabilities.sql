-- ============================================================================
-- 069_prioridades_enforce_capabilities.sql — Fase 2 RLS, área ficha (la central)
--
-- Reescribe la RLS de prioridades_territoriales y sus satélites (seguimientos,
-- documentos_prioridad) de rol → capacidad, y CIERRA el hoyo de scope cosmético:
-- hasta hoy la RLS no chequeaba región para el regional (podía editar campos
-- operativos de CUALQUIER región; solo la UI lo filtraba). Ahora
-- iniciativa.editar_operativo es scoped a la región de la fila.
--
-- Mapeo de columnas (trigger por-columna):
--   definicionales (24) → iniciativa.editar_definicional  (hoy admin/editor 'all')
--   capa               → iniciativa.editar_capa           (hoy admin/editor 'all')
--   operativas (7)      → iniciativa.editar_operativo      (admin/editor 'all', regional scoped)
--   en_foco            → iniciativa.marcar_foco           ('all' admin/editor/regional)
--   crear/eliminar fila → editar_definicional / iniciativa.eliminar
--
-- No-regresión (verificado por caps): admin/editor full; regional operativo+foco
-- en SU región (antes: cualquier región — se APRIETA a propósito), definicional/
-- capa bloqueado; viewer sin UPDATE. La SELECT (world-readable) NO se toca (Fase 3).
--
-- Limpieza: se quita la cap iniciativa.marcar_foco de los viewers (el preset la
-- daba por error; la RLS UPDATE excluía a viewer, así que enforzarla sería una
-- regresión de privilegio). Ver lib/permissions.ts (preset viewer).
-- ============================================================================

-- ── INSERT / DELETE de la fila ──────────────────────────────────────────────
DROP POLICY IF EXISTS prioridades_insert_by_role ON public.prioridades_territoriales;
CREATE POLICY prioridades_insert_by_cap ON public.prioridades_territoriales
  FOR INSERT TO public
  WITH CHECK (public.current_user_can('iniciativa.editar_definicional', cod));

DROP POLICY IF EXISTS prioridades_delete_by_role ON public.prioridades_territoriales;
CREATE POLICY prioridades_delete_by_cap ON public.prioridades_territoriales
  FOR DELETE TO public
  USING (public.current_user_can('iniciativa.eliminar', cod));

-- ── UPDATE (gate grueso): tener ALGUNA cap de edición en la región de la fila.
--    El control fino por columna lo hace el trigger de abajo. ──
DROP POLICY IF EXISTS prioridades_update_by_role ON public.prioridades_territoriales;
CREATE POLICY prioridades_update_by_cap ON public.prioridades_territoriales
  FOR UPDATE TO public
  USING (
    public.current_user_can('iniciativa.editar_operativo', cod)
    OR public.current_user_can('iniciativa.editar_definicional', cod)
    OR public.current_user_can('iniciativa.editar_capa', cod)
    OR public.current_user_can('iniciativa.marcar_foco', cod))
  WITH CHECK (
    public.current_user_can('iniciativa.editar_operativo', cod)
    OR public.current_user_can('iniciativa.editar_definicional', cod)
    OR public.current_user_can('iniciativa.editar_capa', cod)
    OR public.current_user_can('iniciativa.marcar_foco', cod));

-- ── Trigger por-columna cap-aware ──
CREATE OR REPLACE FUNCTION public.prioridades_check_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1) Editar definicional en esta región → cualquier columna.
  IF public.current_user_can('iniciativa.editar_definicional', OLD.cod) THEN
    RETURN NEW;
  END IF;

  -- 2) 'capa' requiere iniciativa.editar_capa.
  IF NEW.capa IS DISTINCT FROM OLD.capa
     AND NOT public.current_user_can('iniciativa.editar_capa', OLD.cod) THEN
    RAISE EXCEPTION 'modificar la capa requiere iniciativa.editar_capa'
      USING ERRCODE = '42501';
  END IF;

  -- 3) Columnas definicionales → requieren editar_definicional (no lo tiene) → bloqueado.
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
     NEW.comuna_cods       IS DISTINCT FROM OLD.comuna_cods       OR
     NEW.alcance_regional  IS DISTINCT FROM OLD.alcance_regional  OR
     NEW.rat               IS DISTINCT FROM OLD.rat               OR
     NEW.origen            IS DISTINCT FROM OLD.origen            OR
     NEW.n                 IS DISTINCT FROM OLD.n                 OR
     NEW.id                IS DISTINCT FROM OLD.id                THEN
    RAISE EXCEPTION 'modificar campos definicionales requiere iniciativa.editar_definicional'
      USING ERRCODE = '42501';
  END IF;

  -- 4) 'en_foco' requiere iniciativa.marcar_foco.
  IF NEW.en_foco IS DISTINCT FROM OLD.en_foco
     AND NOT public.current_user_can('iniciativa.marcar_foco', OLD.cod) THEN
    RAISE EXCEPTION 'marcar/quitar foco requiere iniciativa.marcar_foco'
      USING ERRCODE = '42501';
  END IF;

  -- 5) Columnas operativas (salvo en_foco) → requieren editar_operativo en la región.
  --    Acá se CIERRA el scope cosmético: el regional solo edita operativo en su región.
  IF (NEW.estado_semaforo         IS DISTINCT FROM OLD.estado_semaforo         OR
      NEW.pct_avance              IS DISTINCT FROM OLD.pct_avance              OR
      NEW.responsable             IS DISTINCT FROM OLD.responsable             OR
      NEW.etapa_actual            IS DISTINCT FROM OLD.etapa_actual            OR
      NEW.estado_termino_gobierno IS DISTINCT FROM OLD.estado_termino_gobierno OR
      NEW.proximo_hito            IS DISTINCT FROM OLD.proximo_hito            OR
      NEW.fecha_proximo_hito      IS DISTINCT FROM OLD.fecha_proximo_hito)
     AND NOT public.current_user_can('iniciativa.editar_operativo', OLD.cod) THEN
    RAISE EXCEPTION 'modificar campos operativos requiere iniciativa.editar_operativo en la región %', OLD.cod
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- ── Satélites: seguimientos / documentos_prioridad ──
-- INSERT sigue abierto a cualquier autenticado (= seguimiento_crear/documento_subir
-- 'all' para todos). UPDATE/DELETE: autor/dueño O quien tiene gestionar_ajeno
-- (hoy admin/editor).
DROP POLICY IF EXISTS seguimientos_update_owner_or_staff ON public.seguimientos;
CREATE POLICY seguimientos_update_owner_or_staff ON public.seguimientos
  FOR UPDATE TO public
  USING (autor = (auth.jwt() ->> 'email') OR public.current_user_can('iniciativa.gestionar_ajeno'))
  WITH CHECK (autor = (auth.jwt() ->> 'email') OR public.current_user_can('iniciativa.gestionar_ajeno'));

DROP POLICY IF EXISTS seguimientos_delete_owner_or_staff ON public.seguimientos;
CREATE POLICY seguimientos_delete_owner_or_staff ON public.seguimientos
  FOR DELETE TO public
  USING (autor = (auth.jwt() ->> 'email') OR public.current_user_can('iniciativa.gestionar_ajeno'));

DROP POLICY IF EXISTS documentos_update_by_staff ON public.documentos_prioridad;
CREATE POLICY documentos_update_by_staff ON public.documentos_prioridad
  FOR UPDATE TO public
  USING (public.current_user_can('iniciativa.gestionar_ajeno'))
  WITH CHECK (public.current_user_can('iniciativa.gestionar_ajeno'));

DROP POLICY IF EXISTS documentos_delete_owner_or_staff ON public.documentos_prioridad;
CREATE POLICY documentos_delete_owner_or_staff ON public.documentos_prioridad
  FOR DELETE TO public
  USING (subido_por = (auth.jwt() ->> 'email') OR public.current_user_can('iniciativa.gestionar_ajeno'));

-- ── Limpieza: quitar iniciativa.marcar_foco de los viewers (preset corregido) ──
DELETE FROM public.user_capabilities
WHERE capability_key = 'iniciativa.marcar_foco'
  AND user_id IN (SELECT id FROM public.user_profiles WHERE role = 'viewer');
