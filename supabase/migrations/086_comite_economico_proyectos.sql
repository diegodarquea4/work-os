-- ============================================================================
-- 086_comite_economico_proyectos.sql
--
-- Cartera de proyectos del Comité Económico — dos fuentes:
--   · Privados: tabla nueva `comite_economico_proyecto`, cargados a mano
--     (16 campos declarados por el usuario). Avances por SEREMI en
--     `comite_economico_proyecto_seguimiento` (mismo espíritu que
--     `seguimientos` de iniciativas, mig 081, pero tabla propia — esa tiene
--     `prioridad_id` hardcodeado en columna/RLS, no es genérica).
--   · Públicos: SIN tabla nueva — iniciativas de `prioridades_territoriales`
--     con la etiqueta 'CER' en `tags` (mismo mecanismo que el tag de
--     Infraestructura, mig 060, pero fijo — no configurable por región).
--
-- `sesion_proyectos` (mig 049) se amplía para poder referenciar un proyecto
-- privado O una iniciativa pública en vez de únicamente v2_proyectos_inversion.
-- ============================================================================

-- ── 1. comite_economico_proyecto ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comite_economico_proyecto (
  id BIGSERIAL PRIMARY KEY,
  region_cod TEXT NOT NULL,
  plazo TEXT CHECK (plazo IN ('CP', 'MP', 'LP')),
  priorizado BOOLEAN NOT NULL DEFAULT false,
  nombre TEXT NOT NULL,
  seremi_lider TEXT,
  inversion_monto NUMERIC,
  inversion_moneda TEXT,
  fuente_financiamiento TEXT,
  mano_obra_directa NUMERIC,
  mano_obra_indirecta NUMERIC,
  responsable_operativo TEXT,
  kpi TEXT,
  meta_2026_2027 TEXT,
  estado_inicial TEXT,
  estado_actual TEXT,
  vida_util_anios NUMERIC,
  riesgo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comite_economico_proyecto_region
  ON public.comite_economico_proyecto (region_cod);

ALTER TABLE public.comite_economico_proyecto ENABLE ROW LEVEL SECURITY;

-- Lectura: mismo scope regional que el resto de las tablas de lectura
-- (mig 072) — cualquiera que vea la región ve su cartera de proyectos.
DROP POLICY IF EXISTS comite_economico_proyecto_select ON public.comite_economico_proyecto;
CREATE POLICY comite_economico_proyecto_select ON public.comite_economico_proyecto
  FOR SELECT TO authenticated
  USING (public.current_user_sees_region(region_cod));

-- Escritura: capacidad del comité en la región (mismo gate que opera la
-- sesión — "el responsable" del spec).
DROP POLICY IF EXISTS comite_economico_proyecto_insert ON public.comite_economico_proyecto;
CREATE POLICY comite_economico_proyecto_insert ON public.comite_economico_proyecto
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can('comite.economico.operar', region_cod));

DROP POLICY IF EXISTS comite_economico_proyecto_update ON public.comite_economico_proyecto;
CREATE POLICY comite_economico_proyecto_update ON public.comite_economico_proyecto
  FOR UPDATE TO authenticated
  USING (public.current_user_can('comite.economico.operar', region_cod))
  WITH CHECK (public.current_user_can('comite.economico.operar', region_cod));

DROP POLICY IF EXISTS comite_economico_proyecto_delete ON public.comite_economico_proyecto;
CREATE POLICY comite_economico_proyecto_delete ON public.comite_economico_proyecto
  FOR DELETE TO authenticated
  USING (public.current_user_can('comite.economico.operar', region_cod));

-- ── 2. comite_economico_proyecto_seguimiento — avances ──────────────────────
-- Solo tipo "avance" (fecha + descripción + estado opcional + autor) — sin
-- la complejidad de reunión/hito de `seguimientos` (mig 081), no se pidió.

CREATE TABLE IF NOT EXISTS public.comite_economico_proyecto_seguimiento (
  id BIGSERIAL PRIMARY KEY,
  proyecto_id BIGINT NOT NULL REFERENCES public.comite_economico_proyecto(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  descripcion TEXT NOT NULL,
  estado TEXT CHECK (estado IN ('pendiente', 'en_curso', 'completado', 'bloqueado')),
  autor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comite_economico_proyecto_seguimiento_proyecto
  ON public.comite_economico_proyecto_seguimiento (proyecto_id, fecha DESC);

ALTER TABLE public.comite_economico_proyecto_seguimiento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comite_economico_seguimiento_select ON public.comite_economico_proyecto_seguimiento;
CREATE POLICY comite_economico_seguimiento_select ON public.comite_economico_proyecto_seguimiento
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.comite_economico_proyecto p
    WHERE p.id = comite_economico_proyecto_seguimiento.proyecto_id
      AND public.current_user_sees_region(p.region_cod)));

DROP POLICY IF EXISTS comite_economico_seguimiento_insert ON public.comite_economico_proyecto_seguimiento;
CREATE POLICY comite_economico_seguimiento_insert ON public.comite_economico_proyecto_seguimiento
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.comite_economico_proyecto p
    WHERE p.id = comite_economico_proyecto_seguimiento.proyecto_id
      AND public.current_user_can('comite.economico.operar', p.region_cod)));

-- Editar/borrar: el propio autor, o quien opera el comité en esa región
-- (mismo criterio que seguimientos de iniciativas, mig 069).
DROP POLICY IF EXISTS comite_economico_seguimiento_update ON public.comite_economico_proyecto_seguimiento;
CREATE POLICY comite_economico_seguimiento_update ON public.comite_economico_proyecto_seguimiento
  FOR UPDATE TO authenticated
  USING (
    autor = (auth.jwt() ->> 'email')
    OR EXISTS (
      SELECT 1 FROM public.comite_economico_proyecto p
      WHERE p.id = comite_economico_proyecto_seguimiento.proyecto_id
        AND public.current_user_can('comite.economico.operar', p.region_cod)))
  WITH CHECK (
    autor = (auth.jwt() ->> 'email')
    OR EXISTS (
      SELECT 1 FROM public.comite_economico_proyecto p
      WHERE p.id = comite_economico_proyecto_seguimiento.proyecto_id
        AND public.current_user_can('comite.economico.operar', p.region_cod)));

DROP POLICY IF EXISTS comite_economico_seguimiento_delete ON public.comite_economico_proyecto_seguimiento;
CREATE POLICY comite_economico_seguimiento_delete ON public.comite_economico_proyecto_seguimiento
  FOR DELETE TO authenticated
  USING (
    autor = (auth.jwt() ->> 'email')
    OR EXISTS (
      SELECT 1 FROM public.comite_economico_proyecto p
      WHERE p.id = comite_economico_proyecto_seguimiento.proyecto_id
        AND public.current_user_can('comite.economico.operar', p.region_cod)));

-- ── 3. sesion_proyectos — referenciar privado o público ──────────────────────
-- `proyecto_id` (TEXT → v2_proyectos_inversion) queda deprecada: no se
-- vuelve a escribir, se mantiene solo por si hay sesiones históricas ya
-- cerradas que la referencian (el módulo está en marcha blanca, pero no
-- vale la pena arriesgar un DROP silencioso de datos reales).

ALTER TABLE public.sesion_proyectos
  ALTER COLUMN proyecto_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS proyecto_privado_id BIGINT REFERENCES public.comite_economico_proyecto(id),
  ADD COLUMN IF NOT EXISTS prioridad_id INT;

ALTER TABLE public.sesion_proyectos
  DROP CONSTRAINT IF EXISTS sesion_proyectos_referencia_unica_ck;
ALTER TABLE public.sesion_proyectos
  ADD CONSTRAINT sesion_proyectos_referencia_unica_ck CHECK (
    (proyecto_privado_id IS NOT NULL)::int
    + (prioridad_id IS NOT NULL)::int
    + (proyecto_id IS NOT NULL)::int
    = 1
  );

-- UNIQUE(sesion_id, proyecto_id) de la 049 no cubre las columnas nuevas
-- (NULL <> NULL no bloquea duplicados) — un proyecto privado o público no
-- se agrega dos veces a la misma sesión.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sesion_proyectos_privado
  ON public.sesion_proyectos (sesion_id, proyecto_privado_id)
  WHERE proyecto_privado_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sesion_proyectos_publico
  ON public.sesion_proyectos (sesion_id, prioridad_id)
  WHERE prioridad_id IS NOT NULL;
