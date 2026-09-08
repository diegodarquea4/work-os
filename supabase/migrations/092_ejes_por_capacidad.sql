-- ════════════════════════════════════════════════════════════════════════════
-- 092 — Gestionar el catálogo de ejes pasa de ROL a CAPACIDAD
--
-- Hasta ahora agregar / renombrar / reordenar / fusionar ejes era admin+editor
-- por rol, tanto en la UI como en la RLS. La capacidad `region.gestionar_ejes`
-- ya existía en el catálogo (lib/permissions.ts) pero estaba dormida: nadie la
-- consultaba. Esta migración la vuelve el gate real, así que se puede conceder
-- desde Usuarios → Permisos a un regional (acotada a SU región) o a quien sea.
--
-- ── Lo que no es obvio: el rename toca TRES tablas ──────────────────────────
-- `region_ejes.nombre` guarda el nombre puro, pero el label «Eje N: Nombre»
-- está DENORMALIZADO en `prioridades_territoriales.eje` y `metricas_eje.eje`.
-- El trigger `region_ejes_propagar_label` (mig 083) lo reescribe, y la RPC
-- `reasignar_y_borrar_eje` además mueve `eje_id`. Los tres corren SECURITY
-- INVOKER, o sea con los permisos del usuario. Entonces, sin tocar nada más,
-- un regional con la capacidad renombraría el eje y reventaría acto seguido con
--   «modificar campos definicionales requiere iniciativa.editar_definicional»
-- porque `eje` y `eje_id` son columnas definicionales de la iniciativa.
--
-- Por eso los dos triggers de columnas aprenden un caso nuevo y ACOTADO: quien
-- tiene `region.gestionar_ejes` en la región de la fila puede reescribir `eje`
-- y `eje_id`, y SOLO eso, y SOLO si el nuevo valor es exactamente el label
-- canónico del `eje_id` que queda («Eje N: Nombre» leído de region_ejes, misma
-- región). No puede escribir texto libre en `eje`, ni apuntar a un eje de otra
-- región, ni colar otro campo definicional en la misma sentencia.
--
-- Se conserva `TO PUBLIC` en las policies (como estaban): desde la mig 088
-- `anon` no tiene GRANT sobre ninguna tabla de `public`, así que en los hechos
-- esto solo aplica a `authenticated`.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. region_ejes: escribir por capacidad, no por rol ──────────────────────

DROP POLICY IF EXISTS region_ejes_insert ON public.region_ejes;
CREATE POLICY region_ejes_insert ON public.region_ejes
  FOR INSERT
  WITH CHECK (public.current_user_can('region.gestionar_ejes', region_cod));

DROP POLICY IF EXISTS region_ejes_update ON public.region_ejes;
CREATE POLICY region_ejes_update ON public.region_ejes
  FOR UPDATE
  USING      (public.current_user_can('region.gestionar_ejes', region_cod))
  WITH CHECK (public.current_user_can('region.gestionar_ejes', region_cod));

DROP POLICY IF EXISTS region_ejes_delete ON public.region_ejes;
CREATE POLICY region_ejes_delete ON public.region_ejes
  FOR DELETE
  USING (public.current_user_can('region.gestionar_ejes', region_cod));

-- ── 2. region_ejes: qué columnas puede tocar quien tiene la capacidad ───────
-- `sesiones_habilitadas` / `sesiones_nombre` son el ancla del Comité Policial
-- de la región (mig 044): apagarlo por accidente deja a la región sin comité.
-- La UI no las edita — se configuran por migración. Se dejan fuera del alcance
-- de la capacidad; admin/editor siguen pudiendo todo, como hasta hoy.

CREATE OR REPLACE FUNCTION public.region_ejes_check_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;             -- service-role / migraciones
  IF public.current_user_role() IN ('admin', 'editor') THEN RETURN NEW; END IF;

  IF NEW.id                   IS DISTINCT FROM OLD.id                   OR
     NEW.region_cod           IS DISTINCT FROM OLD.region_cod           OR
     NEW.sesiones_habilitadas IS DISTINCT FROM OLD.sesiones_habilitadas OR
     NEW.sesiones_nombre      IS DISTINCT FROM OLD.sesiones_nombre      THEN
    RAISE EXCEPTION 'con region.gestionar_ejes solo se puede cambiar el numero y el nombre del eje'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.region_ejes_check_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS region_ejes_check_update_trg ON public.region_ejes;
CREATE TRIGGER region_ejes_check_update_trg
  BEFORE UPDATE ON public.region_ejes
  FOR EACH ROW EXECUTE FUNCTION public.region_ejes_check_update();

-- ── 3. prioridades_territoriales: dejar pasar la propagación del label ──────

DROP POLICY IF EXISTS prioridades_update_by_cap ON public.prioridades_territoriales;
CREATE POLICY prioridades_update_by_cap ON public.prioridades_territoriales
  FOR UPDATE
  USING (
    public.current_user_sees_ministerio(ministerio)
    AND (
      public.current_user_can('iniciativa.editar_operativo',    cod)
      OR public.current_user_can('iniciativa.editar_avance',      cod)
      OR public.current_user_can('iniciativa.editar_definicional', cod)
      OR public.current_user_can('iniciativa.editar_capa',        cod)
      OR public.current_user_can('iniciativa.marcar_foco',        cod)
      -- Nuevo: deja pasar la fila. QUÉ columnas puede tocar lo decide el
      -- trigger de abajo, que lo limita al label del eje.
      OR public.current_user_can('region.gestionar_ejes',         cod)
    )
  );

CREATE OR REPLACE FUNCTION public.prioridades_check_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_propaga_eje boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.current_user_can('iniciativa.editar_definicional', OLD.cod) THEN
    RETURN NEW;
  END IF;

  -- ¿Es la propagación del catálogo de ejes? Solo si quien escribe gestiona los
  -- ejes de ESTA región y el nuevo `eje` es exactamente el label canónico del
  -- `eje_id` que queda, dentro de la misma región. Cualquier otra escritura de
  -- `eje`/`eje_id` sigue exigiendo iniciativa.editar_definicional.
  IF (NEW.eje IS DISTINCT FROM OLD.eje OR NEW.eje_id IS DISTINCT FROM OLD.eje_id)
     AND NEW.eje_id IS NOT NULL
     AND public.current_user_can('region.gestionar_ejes', OLD.cod)
  THEN
    v_propaga_eje := NEW.eje = (
      SELECT 'Eje ' || re.numero || ': ' || re.nombre
      FROM public.region_ejes re
      WHERE re.id = NEW.eje_id AND re.region_cod = OLD.cod
    );
  END IF;

  IF NEW.capa IS DISTINCT FROM OLD.capa
     AND NOT public.current_user_can('iniciativa.editar_capa', OLD.cod) THEN
    RAISE EXCEPTION 'modificar la capa requiere iniciativa.editar_capa'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.region            IS DISTINCT FROM OLD.region            OR
     NEW.cod               IS DISTINCT FROM OLD.cod               OR
     NEW.capital           IS DISTINCT FROM OLD.capital           OR
     NEW.zona              IS DISTINCT FROM OLD.zona              OR
     (NOT v_propaga_eje AND (
       NEW.eje    IS DISTINCT FROM OLD.eje  OR
       NEW.eje_id IS DISTINCT FROM OLD.eje_id))                   OR
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

  IF NEW.en_foco IS DISTINCT FROM OLD.en_foco
     AND NOT public.current_user_can('iniciativa.marcar_foco', OLD.cod) THEN
    RAISE EXCEPTION 'marcar/quitar foco requiere iniciativa.marcar_foco'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.estado_semaforo IS DISTINCT FROM OLD.estado_semaforo OR
      NEW.pct_avance      IS DISTINCT FROM OLD.pct_avance)
     AND NOT public.current_user_can('iniciativa.editar_operativo', OLD.cod)
     AND NOT public.current_user_can('iniciativa.editar_avance', OLD.cod) THEN
    RAISE EXCEPTION 'mover semaforo o porcentaje de avance requiere iniciativa.editar_avance en la region %', OLD.cod
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.responsable             IS DISTINCT FROM OLD.responsable             OR
      NEW.etapa_actual            IS DISTINCT FROM OLD.etapa_actual            OR
      NEW.estado_termino_gobierno IS DISTINCT FROM OLD.estado_termino_gobierno OR
      NEW.proximo_hito            IS DISTINCT FROM OLD.proximo_hito            OR
      NEW.fecha_proximo_hito      IS DISTINCT FROM OLD.fecha_proximo_hito)
     AND NOT public.current_user_can('iniciativa.editar_operativo', OLD.cod) THEN
    RAISE EXCEPTION 'modificar campos operativos requiere iniciativa.editar_operativo en la region %', OLD.cod
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 4. metricas_eje: lo mismo ───────────────────────────────────────────────

DROP POLICY IF EXISTS metricas_update_by_cap ON public.metricas_eje;
CREATE POLICY metricas_update_by_cap ON public.metricas_eje
  FOR UPDATE
  USING (
    public.current_user_can('metrica.reportar_valor', region_cod)
    OR public.current_user_can('metrica.definir',       region_cod)
    OR public.current_user_can('region.gestionar_ejes', region_cod)
  )
  WITH CHECK (
    public.current_user_can('metrica.reportar_valor', region_cod)
    OR public.current_user_can('metrica.definir',       region_cod)
    OR public.current_user_can('region.gestionar_ejes', region_cod)
  );

CREATE OR REPLACE FUNCTION public.metricas_eje_check_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.current_user_can('metrica.definir', OLD.region_cod) THEN
    RETURN NEW;
  END IF;

  -- Propagación del label del eje (mismo criterio que en prioridades): solo
  -- `eje`/`eje_id`, solo con el label canónico, y nada más en la misma fila.
  IF public.current_user_can('region.gestionar_ejes', OLD.region_cod)
     AND NEW.eje_id IS NOT NULL
     AND NEW.eje = (SELECT 'Eje ' || re.numero || ': ' || re.nombre
                    FROM public.region_ejes re
                    WHERE re.id = NEW.eje_id AND re.region_cod = OLD.region_cod)
     AND NEW.id                   IS NOT DISTINCT FROM OLD.id
     AND NEW.region_cod           IS NOT DISTINCT FROM OLD.region_cod
     AND NEW.titulo               IS NOT DISTINCT FROM OLD.titulo
     AND NEW.descripcion          IS NOT DISTINCT FROM OLD.descripcion
     AND NEW.objetivo             IS NOT DISTINCT FROM OLD.objetivo
     AND NEW.unidad               IS NOT DISTINCT FROM OLD.unidad
     AND NEW.valor_actual         IS NOT DISTINCT FROM OLD.valor_actual
     AND NEW.tipo                 IS NOT DISTINCT FROM OLD.tipo
     AND NEW.se_reporta_en_sesion IS NOT DISTINCT FROM OLD.se_reporta_en_sesion
     AND NEW.prioridad_id         IS NOT DISTINCT FROM OLD.prioridad_id
     AND NEW.created_at           IS NOT DISTINCT FROM OLD.created_at
     AND NEW.created_by_email     IS NOT DISTINCT FROM OLD.created_by_email
  THEN
    RETURN NEW;
  END IF;

  IF public.current_user_can('metrica.reportar_valor', OLD.region_cod) THEN
    IF NEW.titulo               IS DISTINCT FROM OLD.titulo               OR
       NEW.descripcion          IS DISTINCT FROM OLD.descripcion          OR
       NEW.objetivo             IS DISTINCT FROM OLD.objetivo             OR
       NEW.unidad               IS DISTINCT FROM OLD.unidad               OR
       NEW.region_cod           IS DISTINCT FROM OLD.region_cod           OR
       NEW.eje                  IS DISTINCT FROM OLD.eje                  OR
       NEW.eje_id               IS DISTINCT FROM OLD.eje_id               OR
       NEW.prioridad_id         IS DISTINCT FROM OLD.prioridad_id         OR
       NEW.tipo                 IS DISTINCT FROM OLD.tipo                 OR
       NEW.se_reporta_en_sesion IS DISTINCT FROM OLD.se_reporta_en_sesion OR
       NEW.created_at           IS DISTINCT FROM OLD.created_at           OR
       NEW.created_by_email     IS DISTINCT FROM OLD.created_by_email     OR
       NEW.id                   IS DISTINCT FROM OLD.id                   THEN
      RAISE EXCEPTION 'solo puede modificar valor_actual en metricas_eje (la definición la cambia quien tiene metrica.definir)'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.se_reporta_en_sesion AND NEW.valor_actual IS DISTINCT FROM OLD.valor_actual THEN
      RAISE EXCEPTION 'este valor se alimenta desde las sesiones (cierra una sesión para actualizarlo)'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'sin capacidad para modificar metricas_eje en %', OLD.region_cod
    USING ERRCODE = '42501';
END;
$$;

COMMIT;
