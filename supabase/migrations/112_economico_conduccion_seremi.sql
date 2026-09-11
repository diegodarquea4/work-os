-- ============================================================================
-- 110_economico_conduccion_seremi.sql
--
-- El SEREMI de Economía no podía entrar al Comité Económico: la sección de
-- comités estaba cerrada al rol `seremi` completo, por delante de cualquier
-- capacidad. O sea que darle «Operar Comité Económico» no servía de nada.
--
-- Se abre, y de paso se parte en dos lo que hasta ahora era un solo nivel:
--
--   · CONDUCIR — abrir, manipular y cerrar sesiones; sumar proyectos a la
--     cartera; sacarlos; configurar la meta de empleo. Es del SEREMI de
--     Economía y de quien lleva el comité por la delegación (regional, editor,
--     admin).
--   · APORTAR — ver la cartera, editar el detalle de un proyecto, registrar
--     avances y permisos. Cualquier SEREMI con la capacidad, sea del ministerio
--     que sea: son quienes efectivamente hacen avanzar los proyectos.
--
-- La diferencia NO es una capacidad nueva. Es la misma
-- `comite.economico.operar` leída junto al ministerio del SEREMI, porque así lo
-- pidió el comité: se asigna un permiso y el sistema sabe quién conduce.
--
-- El costo de esa decisión, dicho de frente: el ministerio queda escrito en la
-- lógica de autorización. Si alguna región quisiera que otro SEREMI condujera
-- —Hacienda, por ejemplo— hay que tocar esta función, no una pantalla. Se
-- concentró en un único lugar (`es_seremi_ajeno_al_economico`) justamente para
-- que ese cambio sea de una línea.
-- ============================================================================

-- ── 1. El corte ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.es_seremi_ajeno_al_economico()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.current_user_role() = 'seremi'
     AND public.norm_ministerio(public.current_user_ministerio())
         <> public.norm_ministerio('Ministerio de Economía, Fomento y Turismo');
$$;

COMMENT ON FUNCTION public.es_seremi_ajeno_al_economico() IS
  'true para un SEREMI que no es de Economía. Único lugar donde el ministerio conductor está escrito: cambiarlo acá lo cambia en todo el comité.';

/** Puede conducir el Comité Económico en esa región: tiene la capacidad y no es
    un SEREMI de otro ministerio. */
CREATE OR REPLACE FUNCTION public.conduce_economico(p_region text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.current_user_can('comite.economico.operar', p_region)
     AND NOT public.es_seremi_ajeno_al_economico();
$$;

-- ── 2. Las sesiones ──────────────────────────────────────────────────────────
-- Las dos funciones de abajo son el único control de escritura de TODAS las
-- tablas de sesión (eje_sesiones, sesion_nomina, sesion_compromisos,
-- sesion_asistencia, sesion_proyectos, sesion_temas… 14 tablas en total).
-- Agregar el corte acá lo aplica en todas de una vez, en vez de reescribir
-- cuarenta políticas que después se desincronizan entre sí.

CREATE OR REPLACE FUNCTION public.can_operar_instancia(p_instancia text, p_region text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.current_user_can(
    CASE p_instancia
      WHEN 'eje'             THEN 'comite.policial.operar'
      WHEN 'politico'        THEN 'comite.politico.operar'
      WHEN 'inversion'       THEN 'comite.economico.operar'
      WHEN 'gabinete'        THEN 'comite.gabinete.operar'
      WHEN 'infraestructura' THEN 'comite.infraestructura.operar'
      ELSE '__none__'
    END,
    p_region)
  -- Las sesiones del Económico las conduce Economía. Un SEREMI de otro
  -- ministerio con la capacidad aporta en la cartera, no abre ni cierra
  -- sesiones.
  AND NOT (p_instancia = 'inversion' AND public.es_seremi_ajeno_al_economico());
$$;

CREATE OR REPLACE FUNCTION public.can_operar_sesion(p_sesion_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.eje_sesiones s
    WHERE s.id = p_sesion_id
      AND public.can_operar_instancia(s.instancia, s.region_cod));
$$;

-- ── 3. Oficios tratados ──────────────────────────────────────────────────────
-- Es contenido de sesión pero sus políticas nombran la capacidad directamente,
-- así que no las alcanzan las funciones de arriba.

DROP POLICY IF EXISTS sesion_oficios_operador_insert ON public.sesion_oficios_tratados;
CREATE POLICY sesion_oficios_operador_insert ON public.sesion_oficios_tratados
  FOR INSERT TO authenticated
  WITH CHECK (public.conduce_economico(region_cod));

DROP POLICY IF EXISTS sesion_oficios_operador_update ON public.sesion_oficios_tratados;
CREATE POLICY sesion_oficios_operador_update ON public.sesion_oficios_tratados
  FOR UPDATE TO authenticated
  USING (public.conduce_economico(region_cod))
  WITH CHECK (public.conduce_economico(region_cod));

-- La lectura NO se toca: un oficio pendiente es contexto que cualquier SEREMI
-- del comité necesita para saber por qué su proyecto está frenado.

-- ── 4. La cartera ────────────────────────────────────────────────────────────
-- Quién entra y quién sale de la cartera lo decide quien conduce. El detalle de
-- un proyecto que ya está adentro lo edita cualquiera con la capacidad — es
-- justamente lo que el SEREMI sectorial sabe y la delegación no.

DROP POLICY IF EXISTS comite_economico_proyecto_insert ON public.comite_economico_proyecto;
CREATE POLICY comite_economico_proyecto_insert ON public.comite_economico_proyecto
  FOR INSERT TO authenticated
  WITH CHECK (public.conduce_economico(region_cod));

DROP POLICY IF EXISTS comite_economico_proyecto_delete ON public.comite_economico_proyecto;
CREATE POLICY comite_economico_proyecto_delete ON public.comite_economico_proyecto
  FOR DELETE TO authenticated
  USING (public.conduce_economico(region_cod));

-- UPDATE, avances (`_seguimiento`) y permisos (`_permiso`) se quedan como
-- estaban, con `comite.economico.operar` a secas: son exactamente el aporte que
-- se le está abriendo al resto de los SEREMI.

-- ── 5. Meta Empleo ───────────────────────────────────────────────────────────
-- El objetivo de la región y los cupos son definición del comité, no aporte.

DROP POLICY IF EXISTS region_meta_empleo_operador_insert ON public.region_meta_empleo;
CREATE POLICY region_meta_empleo_operador_insert ON public.region_meta_empleo
  FOR INSERT TO authenticated
  WITH CHECK (public.conduce_economico(region_cod));

DROP POLICY IF EXISTS region_meta_empleo_operador_update ON public.region_meta_empleo;
CREATE POLICY region_meta_empleo_operador_update ON public.region_meta_empleo
  FOR UPDATE TO authenticated
  USING (public.conduce_economico(region_cod))
  WITH CHECK (public.conduce_economico(region_cod));

DROP POLICY IF EXISTS region_subsidio_empleo_operador_insert ON public.region_subsidio_empleo;
CREATE POLICY region_subsidio_empleo_operador_insert ON public.region_subsidio_empleo
  FOR INSERT TO authenticated
  WITH CHECK (public.conduce_economico(region_cod));

DROP POLICY IF EXISTS region_subsidio_empleo_operador_update ON public.region_subsidio_empleo;
CREATE POLICY region_subsidio_empleo_operador_update ON public.region_subsidio_empleo
  FOR UPDATE TO authenticated
  USING (public.conduce_economico(region_cod))
  WITH CHECK (public.conduce_economico(region_cod));
