-- ============================================================================
-- 049_sesiones_inversion.sql
--
-- Módulo Sesiones — Comité Seguimiento de la Inversión. A diferencia del
-- Comité Policial (mig 044), este comité NO cuelga de un region_ejes: el tab
-- ya existe fijo para las 16 regiones en la sección «Comités y Gabinete
-- Regional» (components/ComitesRegionalesSection.tsx), no del catálogo
-- editable de «Ejes estratégicos». Por eso eje_sesiones/sesion_nomina/
-- sesion_compromisos ganan una columna `comite` y eje_id pasa a ser opcional
-- (NULL para 'inversion'). El Comité Policial no cambia de comportamiento:
-- sus filas quedan con comite='policial' (default) y su eje_id de siempre —
-- ningún query existente de ese comité se toca.
--
-- Piezas nuevas de Inversión (todas scoped por region_cod, sin eje_id):
--   - oficios_pendientes: catálogo importado semanalmente desde el Excel de
--     SEA (reemplazo completo, ver app/api/oficios-pendientes/import).
--   - sesion_proyectos: proyectos tratados en profundidad en una sesión,
--     FK real a v2_proyectos_inversion (selección desde catálogo, no texto
--     libre).
--   - sesion_oficios_tratados: igual que sesion_compromisos (vive ENTRE
--     sesiones, no es hija desechable) — un oficio se "trata" en una sesión
--     y reaparece en la sesión siguiente si sigue pendiente, hasta que se
--     marca resuelto.
-- ============================================================================

-- ── 1. Comité sin eje: comite + eje_id nullable ─────────────────────────────

ALTER TABLE public.eje_sesiones
  ALTER COLUMN eje_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS comite TEXT NOT NULL DEFAULT 'policial'
    CHECK (comite IN ('policial', 'inversion')),
  ADD CONSTRAINT eje_sesiones_comite_eje_ck
    CHECK ((comite = 'policial' AND eje_id IS NOT NULL) OR (comite = 'inversion' AND eje_id IS NULL));

ALTER TABLE public.sesion_nomina
  ALTER COLUMN eje_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS comite TEXT NOT NULL DEFAULT 'policial'
    CHECK (comite IN ('policial', 'inversion')),
  ADD CONSTRAINT sesion_nomina_comite_eje_ck
    CHECK ((comite = 'policial' AND eje_id IS NOT NULL) OR (comite = 'inversion' AND eje_id IS NULL));

ALTER TABLE public.sesion_compromisos
  ALTER COLUMN eje_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS comite TEXT NOT NULL DEFAULT 'policial'
    CHECK (comite IN ('policial', 'inversion')),
  ADD CONSTRAINT sesion_compromisos_comite_eje_ck
    CHECK ((comite = 'policial' AND eje_id IS NOT NULL) OR (comite = 'inversion' AND eje_id IS NULL));

-- Un solo borrador vivo por (región, comité, eje, provincia). COALESCE en
-- eje_id igual que ya se hacía con provincia_cod (mig 044): NULL <> NULL
-- rompería la unicidad para el comité sin eje.
DROP INDEX IF EXISTS uq_eje_sesiones_un_borrador;
CREATE UNIQUE INDEX uq_eje_sesiones_un_borrador
  ON public.eje_sesiones (region_cod, comite, COALESCE(eje_id, 0), COALESCE(provincia_cod, ''))
  WHERE estado = 'borrador';

CREATE INDEX IF NOT EXISTS idx_eje_sesiones_region_comite_fecha
  ON public.eje_sesiones (region_cod, comite, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_sesion_nomina_region_comite
  ON public.sesion_nomina (region_cod, comite) WHERE activo;

CREATE INDEX IF NOT EXISTS idx_sesion_compromisos_region_comite
  ON public.sesion_compromisos (region_cod, comite, estado);

-- ── 2. Tablas nuevas ─────────────────────────────────────────────────────────

-- Catálogo de oficios pendientes (Excel SEA) — reemplazo completo semanal.
CREATE TABLE IF NOT EXISTS public.oficios_pendientes (
  id BIGSERIAL PRIMARY KEY,
  id_expediente BIGINT,
  region_cod TEXT NOT NULL,
  ministerio TEXT,
  oaeca TEXT,
  nombre_proyecto TEXT,
  tipo_presentacion TEXT,
  inversion_mm NUMERIC,
  tipo_oficio TEXT,
  fecha_oficio TIMESTAMPTZ,
  fecha_limite DATE,
  estado_plazo TEXT,
  emisor TEXT,
  enlace_proyecto TEXT,
  enlace_oficio TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oficios_pendientes_region_limite
  ON public.oficios_pendientes (region_cod, fecha_limite);

-- Proyectos tratados en profundidad en una sesión — selección desde catálogo.
CREATE TABLE IF NOT EXISTS public.sesion_proyectos (
  id BIGSERIAL PRIMARY KEY,
  sesion_id BIGINT NOT NULL REFERENCES public.eje_sesiones(id) ON DELETE CASCADE,
  proyecto_id TEXT NOT NULL REFERENCES public.v2_proyectos_inversion(id),
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sesion_id, proyecto_id)
);

CREATE INDEX IF NOT EXISTS idx_sesion_proyectos_sesion
  ON public.sesion_proyectos (sesion_id);

-- Oficios tratados — vive ENTRE sesiones (igual que sesion_compromisos): un
-- oficio se marca "tratado" en una sesión (estado pendiente) y reaparece en
-- la zona "Oficios anteriores" de la sesión siguiente hasta quedar resuelto.
CREATE TABLE IF NOT EXISTS public.sesion_oficios_tratados (
  id BIGSERIAL PRIMARY KEY,
  region_cod TEXT NOT NULL,
  sesion_origen_id BIGINT NOT NULL REFERENCES public.eje_sesiones(id),
  id_expediente BIGINT,
  nombre_proyecto TEXT,
  ministerio TEXT,
  oaeca TEXT,
  tipo_oficio TEXT,
  fecha_limite DATE,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'resuelto')),
  nota TEXT,
  estado_updated_at TIMESTAMPTZ,
  estado_updated_by_email TEXT,
  resuelto_en_sesion_id BIGINT REFERENCES public.eje_sesiones(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sesion_oficios_region_estado
  ON public.sesion_oficios_tratados (region_cod, estado);

CREATE INDEX IF NOT EXISTS idx_sesion_oficios_origen
  ON public.sesion_oficios_tratados (sesion_origen_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

-- oficios_pendientes: catálogo world-readable (mismo patrón que
-- v2_proyectos_inversion, mig 002 línea 54) — lo llena getSupabaseAdmin(),
-- que bypassa RLS, así que no hace falta policy de escritura.
ALTER TABLE public.oficios_pendientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oficios_pendientes_read" ON public.oficios_pendientes FOR SELECT USING (true);

-- sesion_proyectos: hija de eje_sesiones (scope regional vía el padre),
-- mismo patrón que sesion_valores/sesion_apuntes (mig 044).
ALTER TABLE public.sesion_proyectos ENABLE ROW LEVEL SECURITY;

CREATE POLICY sesion_proyectos_staff_all ON public.sesion_proyectos
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

CREATE POLICY sesion_proyectos_regional_select ON public.sesion_proyectos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_proyectos.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

CREATE POLICY sesion_proyectos_regional_insert ON public.sesion_proyectos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_proyectos.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

CREATE POLICY sesion_proyectos_regional_update ON public.sesion_proyectos
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_proyectos.sesion_id
                    AND s.region_cod = ANY(up.region_cods))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_proyectos.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

CREATE POLICY sesion_proyectos_regional_delete ON public.sesion_proyectos
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_proyectos.sesion_id
                    AND s.estado = 'borrador'
                    AND s.region_cod = ANY(up.region_cods))));

DROP TRIGGER IF EXISTS sesion_proyectos_bloquea_cerrada_trg ON public.sesion_proyectos;
CREATE TRIGGER sesion_proyectos_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.sesion_proyectos
  FOR EACH ROW EXECUTE FUNCTION public.sesion_hijas_bloquea_cerrada();

-- sesion_oficios_tratados: region_cod directo, mismo patrón que
-- sesion_compromisos (mig 044) — SIN trigger de inmutabilidad, vive entre
-- sesiones y su estado se sigue editando en sesiones futuras.
ALTER TABLE public.sesion_oficios_tratados ENABLE ROW LEVEL SECURITY;

CREATE POLICY sesion_oficios_staff_all ON public.sesion_oficios_tratados
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

CREATE POLICY sesion_oficios_regional_select ON public.sesion_oficios_tratados
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND sesion_oficios_tratados.region_cod = ANY(up.region_cods)));

CREATE POLICY sesion_oficios_regional_insert ON public.sesion_oficios_tratados
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND sesion_oficios_tratados.region_cod = ANY(up.region_cods)));

CREATE POLICY sesion_oficios_regional_update ON public.sesion_oficios_tratados
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND sesion_oficios_tratados.region_cod = ANY(up.region_cods)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND sesion_oficios_tratados.region_cod = ANY(up.region_cods)));
