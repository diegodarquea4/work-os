-- ════════════════════════════════════════════════════════════════════════════
-- 087 — Rol SEREMI: scoping por REGIÓN + MINISTERIO (fail-closed en la BD)
--
-- Hasta ahora el modelo de acceso tenía UNA sola dimensión de alcance: la
-- región (`user_profiles.region_cods` + `current_user_sees_region`). El rol
-- SEREMI agrega una segunda: el MINISTERIO. Un SEREMI = 1 región + 1
-- ministerio, y solo ve/toca las iniciativas de su región CUYO ministerio
-- incluya el suyo (`prioridades_territoriales.ministerio` es multi-valor
-- separado por ';', p.ej. "Ministerio de Vivienda y Urbanismo;Ministerio de
-- Obras Públicas" — el SEREMI de MOP la ve).
--
-- Qué puede hacer un SEREMI (decisión de producto):
--   - VER: solo su región + su ministerio (todas las vistas del panel).
--   - ESCRIBIR: agregar seguimientos y tareas de planificación en SUS
--     iniciativas, y mover SOLO el semáforo y el % de avance. Nada más.
--   - NO: campos definicionales, responsable/etapa/hito, foco, capa, borrar,
--     comités, gabinete, desalojos, PREGO, permisos.
--
-- Para el "solo semáforo y % avance" se agrega una capacidad NUEVA y más
-- angosta que `iniciativa.editar_operativo`: `iniciativa.editar_avance`.
-- El trigger de columnas se parte en dos ramas para respetarla.
--
-- Depende de la mig 086 (canonización de `ministerio`), que deja el dato
-- comparable. `norm_ministerio()` igual normaliza al vuelo (tildes,
-- abreviaturas, prefijos) para aguantar entradas sucias futuras.
--
-- Aditiva: sin SEREMIs creados, `current_user_sees_ministerio()` devuelve TRUE
-- para todo el mundo → cero cambio de comportamiento para admin/editor/
-- regional/viewer.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Rol + ministerio en el perfil ────────────────────────────────────────
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role = ANY (ARRAY['admin','editor','regional','viewer','seremi']));

-- Nombre canónico del ministerio del SEREMI (NULL para el resto de los roles).
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS ministerio TEXT;

COMMENT ON COLUMN public.user_profiles.ministerio IS
  'Solo rol seremi: nombre canónico del ministerio que representa (LISTA_CANONICA de lib/ministerios.ts). NULL = sin restricción por ministerio.';

-- ── 2. Normalizador de ministerio ───────────────────────────────────────────
-- Devuelve una CLAVE de comparación: minúsculas, sin tildes, sin el prefijo
-- "Ministerio de/del/de la" ni las abreviaturas/typos vistos en prod. Así
-- "Ministerio de Obras Públicas", "Ministerio de Obras Publicas" y
-- "Min. Obras Publicas" colapsan todos a 'obras publicas'.
--
-- OJO deliberado: "Ministerio del Interior y Seguridad Pública" (nombre
-- histórico previo a la división) produce 'interior y seguridad publica', que
-- NO calza ni con 'interior' ni con 'seguridad publica'. Esas iniciativas están
-- mal categorizadas (ver mig 086) y quedan fuera del alcance de todo SEREMI
-- hasta que se recategoricen. Fail-closed a propósito.
CREATE OR REPLACE FUNCTION public.norm_ministerio(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      translate(
        lower(btrim(coalesce(txt, ''))),
        'áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ',
        'aaaaeeeeiiiioooouuuunaaaaeeeeiiiioooouuuun'
      ),
      -- prefijos: "ministerio de la|de los|del|de", "min.", y typos frecuentes
      '^(ministerio|minsterio|minsiterio|misterio|min\.)\s*(de\s+la\s+|de\s+los\s+|del\s+|de\s+)?',
      ''
    ),
    '\s+', ' ', 'g'
  ));
$$;

-- ── 3. Ministerio del usuario actual + predicado de visibilidad ─────────────
CREATE OR REPLACE FUNCTION public.current_user_ministerio()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT up.ministerio FROM public.user_profiles up WHERE up.id = auth.uid();
$$;

-- TRUE si el usuario no está acotado por ministerio (todos menos SEREMI), o si
-- su ministerio aparece entre los del row (multi-valor ';').
CREATE OR REPLACE FUNCTION public.current_user_sees_ministerio(row_ministerio text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.norm_ministerio(public.current_user_ministerio()) = '' THEN true
    ELSE EXISTS (
      SELECT 1
      FROM unnest(string_to_array(coalesce(row_ministerio, ''), ';')) AS parte
      WHERE public.norm_ministerio(parte) <> ''
        AND public.norm_ministerio(parte)
            = public.norm_ministerio(public.current_user_ministerio())
    )
  END;
$$;

-- ── 4. RLS de LECTURA: región AND ministerio ────────────────────────────────
DROP POLICY IF EXISTS "Public read" ON public.prioridades_territoriales;
CREATE POLICY "Public read" ON public.prioridades_territoriales
  FOR SELECT
  USING (
    public.current_user_sees_region(cod)
    AND public.current_user_sees_ministerio(ministerio)
  );

DROP POLICY IF EXISTS seguimientos_read ON public.seguimientos;
CREATE POLICY seguimientos_read ON public.seguimientos
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.prioridades_territoriales p
    WHERE p.n = seguimientos.prioridad_id
      AND public.current_user_sees_region(p.cod)
      AND public.current_user_sees_ministerio(p.ministerio)
  ));

DROP POLICY IF EXISTS documentos_read ON public.documentos_prioridad;
CREATE POLICY documentos_read ON public.documentos_prioridad
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.prioridades_territoriales p
    WHERE p.n = documentos_prioridad.prioridad_id
      AND public.current_user_sees_region(p.cod)
      AND public.current_user_sees_ministerio(p.ministerio)
  ));

-- Planificación (tareas): la mig 066 ya acota por `planificacion.ver` en la
-- región; se le suma el ministerio.
DROP POLICY IF EXISTS tareas_can_select ON public.tareas;
CREATE POLICY tareas_can_select ON public.tareas
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.prioridades_territoriales p
    WHERE p.n = tareas.prioridad_id
      AND public.current_user_can('planificacion.ver', p.cod)
      AND public.current_user_sees_ministerio(p.ministerio)
  ));

DROP POLICY IF EXISTS tareas_can_insert ON public.tareas;
CREATE POLICY tareas_can_insert ON public.tareas
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.prioridades_territoriales p
    WHERE p.n = tareas.prioridad_id
      AND public.current_user_can('planificacion.editar', p.cod)
      AND public.current_user_sees_ministerio(p.ministerio)
  ));

-- ── 5. Seguimientos: el INSERT ya no es "cualquier autenticado" a secas ─────
-- Ahora hay que poder VER la iniciativa (región + ministerio). Endurecimiento
-- general: nadie debería poder crear un seguimiento sobre algo que no ve.
DROP POLICY IF EXISTS seguimientos_insert_any_authenticated ON public.seguimientos;
CREATE POLICY seguimientos_insert_any_authenticated ON public.seguimientos
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.prioridades_territoriales p
      WHERE p.n = seguimientos.prioridad_id
        AND public.current_user_sees_region(p.cod)
        AND public.current_user_sees_ministerio(p.ministerio)
    )
  );

-- ── 6. UPDATE de iniciativas: suma `editar_avance` + acota por ministerio ───
DROP POLICY IF EXISTS prioridades_update_by_cap ON public.prioridades_territoriales;
CREATE POLICY prioridades_update_by_cap ON public.prioridades_territoriales
  FOR UPDATE
  USING (
    public.current_user_sees_ministerio(ministerio)
    AND (
      public.current_user_can('iniciativa.editar_operativo', cod)
      OR public.current_user_can('iniciativa.editar_avance', cod)
      OR public.current_user_can('iniciativa.editar_definicional', cod)
      OR public.current_user_can('iniciativa.editar_capa', cod)
      OR public.current_user_can('iniciativa.marcar_foco', cod)
    )
  )
  WITH CHECK (
    public.current_user_sees_ministerio(ministerio)
    AND (
      public.current_user_can('iniciativa.editar_operativo', cod)
      OR public.current_user_can('iniciativa.editar_avance', cod)
      OR public.current_user_can('iniciativa.editar_definicional', cod)
      OR public.current_user_can('iniciativa.editar_capa', cod)
      OR public.current_user_can('iniciativa.marcar_foco', cod)
    )
  );

-- ── 7. Trigger de columnas: rama nueva para `editar_avance` ────────────────
-- Idéntico a la mig 069 salvo que la rama operativa se parte en dos:
--   (a) estado_semaforo / pct_avance  → editar_operativo O editar_avance
--   (b) responsable / etapa_actual / estado_termino_gobierno / proximo_hito /
--       fecha_proximo_hito            → solo editar_operativo
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

  IF public.current_user_can('iniciativa.editar_definicional', OLD.cod) THEN
    RETURN NEW;
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

  IF NEW.en_foco IS DISTINCT FROM OLD.en_foco
     AND NOT public.current_user_can('iniciativa.marcar_foco', OLD.cod) THEN
    RAISE EXCEPTION 'marcar/quitar foco requiere iniciativa.marcar_foco'
      USING ERRCODE = '42501';
  END IF;

  -- (a) Avance del día a día: semáforo y % — lo puede mover un SEREMI.
  IF (NEW.estado_semaforo IS DISTINCT FROM OLD.estado_semaforo OR
      NEW.pct_avance      IS DISTINCT FROM OLD.pct_avance)
     AND NOT public.current_user_can('iniciativa.editar_operativo', OLD.cod)
     AND NOT public.current_user_can('iniciativa.editar_avance', OLD.cod) THEN
    RAISE EXCEPTION 'mover semáforo o %% de avance requiere iniciativa.editar_avance en la región %', OLD.cod
      USING ERRCODE = '42501';
  END IF;

  -- (b) Resto de lo operativo: sigue exigiendo editar_operativo.
  IF (NEW.responsable             IS DISTINCT FROM OLD.responsable             OR
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

COMMIT;
