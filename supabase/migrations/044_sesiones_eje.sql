-- ============================================================================
-- 044_sesiones_eje.sql
--
-- Módulo Sesiones (Comité Policial) anclado a «Avance por eje» (spec en
-- docs/spec-modulo-sesiones-comite-policial.md). Las Delegaciones presiden
-- semanalmente el Comité Policial; la sesión captura compromisos anteriores,
-- asistencia, indicadores (que alimentan metricas_eje con semántica
-- suma/pulso), apuntes por institución y compromisos nuevos. Al cerrar se
-- genera el acta PDF (bucket privado comite-docs) y los valores quedan como
-- serie histórica en sesion_valores.
--
-- ⚠️ RLS: este módulo NO hereda el SELECT world-readable del resto del panel.
-- Datos de coordinación policial (nivel gestión): admin/editor todo,
-- regional solo sus region_cods, viewer SIN acceso (ni SELECT).
--
-- Además arregla DOS bugs latentes de mig 023 en metricas_eje_check_update():
--   1. Sin guard service-role (la 028 solo parchó prioridades_check_update):
--      cualquier UPDATE con getSupabaseAdmin() caía al RAISE final. La ruta
--      /api/sesiones/[id]/cerrar escribe métricas con service-role.
--   2. El whitelist enumera columnas prohibidas: las nuevas tipo /
--      se_reporta_en_sesion deben agregarse o un regional podría alterarlas.
--
-- Decisiones documentadas (spec §3/§6 + plan):
--   - objetivo se mantiene NOT NULL; métricas pulso guardan objetivo=0 y la
--     UI lo ignora (evita tocar validaciones existentes).
--   - Idempotencia del cierre sin RPC: claim atómico (UPDATE ... WHERE
--     estado='borrador') + columna metricas_aplicadas. Ver ruta /cerrar.
--   - Regional NO tiene DELETE: el UNIQUE parcial "1 borrador por
--     (región, eje, provincia)" hace que "Nueva sesión" reabra el borrador
--     existente en vez de acumular basura.
--   - Log de reapertura de sesión (spec §5): DIFERIDO — no hay UI de
--     reapertura en el MVP; solo admin puede tocar una cerrada (trigger).
--   - provincia_cod viaja NULL desde el día 1 (capa provincial futura, §4).
-- ============================================================================

-- ── 1. Alters a tablas existentes ───────────────────────────────────────────

ALTER TABLE public.region_ejes
  ADD COLUMN IF NOT EXISTS sesiones_habilitadas BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sesiones_nombre TEXT;

ALTER TABLE public.metricas_eje
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'suma'
    CHECK (tipo IN ('suma', 'pulso')),
  ADD COLUMN IF NOT EXISTS se_reporta_en_sesion BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Re-crear metricas_eje_check_update() (fix 028-style + whitelist) ─────

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
  -- service-role / crons / rutas API admin: sin JWT de usuario. El gate de
  -- esas escrituras es el código del servidor (patrón mig 028).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  ur := public.current_user_role();

  IF ur IN ('admin', 'editor') THEN
    RETURN NEW;
  END IF;

  IF ur = 'regional' THEN
    SELECT region_cods INTO user_regions
    FROM public.user_profiles WHERE id = auth.uid();

    IF user_regions IS NULL OR array_length(user_regions, 1) IS NULL THEN
      RAISE EXCEPTION 'regional sin region_cods asignadas no puede modificar metricas_eje'
        USING ERRCODE = '42501';
    END IF;

    IF NOT (OLD.region_cod = ANY(user_regions)) THEN
      RAISE EXCEPTION 'regional puede modificar valor_actual solo en sus regiones asignadas (%, asignadas: %)',
        OLD.region_cod, array_to_string(user_regions, ',')
        USING ERRCODE = '42501';
    END IF;

    -- Whitelist: solo valor_actual + audit. Incluye las columnas nuevas de
    -- sesiones (tipo, se_reporta_en_sesion) — definición, no operación.
    IF NEW.titulo               IS DISTINCT FROM OLD.titulo               OR
       NEW.descripcion          IS DISTINCT FROM OLD.descripcion          OR
       NEW.objetivo             IS DISTINCT FROM OLD.objetivo             OR
       NEW.unidad               IS DISTINCT FROM OLD.unidad               OR
       NEW.region_cod           IS DISTINCT FROM OLD.region_cod           OR
       NEW.eje                  IS DISTINCT FROM OLD.eje                  OR
       NEW.eje_id               IS DISTINCT FROM OLD.eje_id               OR
       NEW.tipo                 IS DISTINCT FROM OLD.tipo                 OR
       NEW.se_reporta_en_sesion IS DISTINCT FROM OLD.se_reporta_en_sesion OR
       NEW.created_at           IS DISTINCT FROM OLD.created_at           OR
       NEW.created_by_email     IS DISTINCT FROM OLD.created_by_email     OR
       NEW.id                   IS DISTINCT FROM OLD.id                   THEN
      RAISE EXCEPTION 'regional solo puede modificar valor_actual en metricas_eje (la definición la cambia admin/editor)'
        USING ERRCODE = '42501';
    END IF;

    -- Anti doble-conteo: si la métrica se reporta en sesión, el valor entra
    -- por el cierre de sesión (service-role), no por edición inline.
    IF OLD.se_reporta_en_sesion AND NEW.valor_actual IS DISTINCT FROM OLD.valor_actual THEN
      RAISE EXCEPTION 'este valor se alimenta desde las sesiones (cierra una sesión para actualizarlo)'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'rol % no puede modificar metricas_eje', COALESCE(ur, 'sin sesión')
    USING ERRCODE = '42501';
END;
$$;

-- ── 2b. Policy acotada: "+ indicador no contemplado" desde la sesión ────────
-- El INSERT de metricas_eje era solo admin/editor (mig 014), pero el flujo
-- de sesión permite al regional crear un indicador ad-hoc (spec §7 zona 3 /
-- regla 4). Se abre SOLO ese caso: su región + se_reporta_en_sesion=true +
-- eje con sesiones habilitadas. La definición de métricas normales sigue
-- siendo de admin/editor, y el trigger de UPDATE le impide editarla después.
DROP POLICY IF EXISTS metricas_eje_regional_insert_sesion ON public.metricas_eje;
CREATE POLICY metricas_eje_regional_insert_sesion ON public.metricas_eje
  FOR INSERT TO authenticated
  WITH CHECK (
    metricas_eje.se_reporta_en_sesion = true
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'regional'
        AND metricas_eje.region_cod = ANY(up.region_cods))
    AND EXISTS (
      SELECT 1 FROM public.region_ejes re
      WHERE re.id = metricas_eje.eje_id AND re.sesiones_habilitadas));

-- ── 3. Tablas nuevas ────────────────────────────────────────────────────────

-- Sesión de la instancia (Comité Policial u otra futura)
CREATE TABLE IF NOT EXISTS public.eje_sesiones (
  id BIGSERIAL PRIMARY KEY,
  region_cod TEXT NOT NULL,
  eje_id BIGINT NOT NULL REFERENCES public.region_ejes(id),
  provincia_cod TEXT,                    -- NULL = sesión regional (capa DPP futura)
  fecha DATE NOT NULL,
  lugar TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'cerrada')),
  -- Idempotencia del cierre: se marca true tras aplicar suma/pulso a
  -- metricas_eje. El reintento de acta exige metricas_aplicadas y NUNCA
  -- re-aplica valores.
  metricas_aplicadas BOOLEAN NOT NULL DEFAULT false,
  acta_path TEXT,                        -- path relativo en bucket comite-docs
  created_by_email TEXT,
  closed_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Nómina fija (titulares/suplentes designados por oficio; vigencia anual)
CREATE TABLE IF NOT EXISTS public.sesion_nomina (
  id BIGSERIAL PRIMARY KEY,
  region_cod TEXT NOT NULL,
  eje_id BIGINT NOT NULL REFERENCES public.region_ejes(id),
  provincia_cod TEXT,
  nombre TEXT NOT NULL,
  cargo TEXT,
  institucion TEXT NOT NULL,
  calidad TEXT NOT NULL DEFAULT 'titular' CHECK (calidad IN ('titular', 'suplente')),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asistencia por sesión: miembro de nómina O invitado (exactamente uno)
CREATE TABLE IF NOT EXISTS public.sesion_asistencia (
  id BIGSERIAL PRIMARY KEY,
  sesion_id BIGINT NOT NULL REFERENCES public.eje_sesiones(id) ON DELETE CASCADE,
  nomina_id BIGINT REFERENCES public.sesion_nomina(id),
  invitado_nombre TEXT,
  invitado_institucion TEXT,
  presente BOOLEAN NOT NULL DEFAULT true,
  CHECK (nomina_id IS NOT NULL OR invitado_nombre IS NOT NULL)
);

-- Valores de indicadores por sesión (la serie histórica vive aquí)
CREATE TABLE IF NOT EXISTS public.sesion_valores (
  id BIGSERIAL PRIMARY KEY,
  sesion_id BIGINT NOT NULL REFERENCES public.eje_sesiones(id) ON DELETE CASCADE,
  metrica_id BIGINT NOT NULL REFERENCES public.metricas_eje(id),
  valor NUMERIC NOT NULL,
  UNIQUE (sesion_id, metrica_id)
);

-- Apuntes libres por institución (tabs del formulario; upsert por institución)
CREATE TABLE IF NOT EXISTS public.sesion_apuntes (
  id BIGSERIAL PRIMARY KEY,
  sesion_id BIGINT NOT NULL REFERENCES public.eje_sesiones(id) ON DELETE CASCADE,
  institucion TEXT NOT NULL,
  texto TEXT NOT NULL DEFAULT '',
  UNIQUE (sesion_id, institucion)
);

-- Compromisos (viven ENTRE sesiones — no son hijos de una sola; por eso no
-- llevan ON DELETE CASCADE por sesión ni trigger de inmutabilidad)
CREATE TABLE IF NOT EXISTS public.sesion_compromisos (
  id BIGSERIAL PRIMARY KEY,
  region_cod TEXT NOT NULL,
  eje_id BIGINT NOT NULL REFERENCES public.region_ejes(id),
  sesion_origen_id BIGINT NOT NULL REFERENCES public.eje_sesiones(id),
  descripcion TEXT NOT NULL,
  responsable_institucion TEXT NOT NULL,
  responsable_nombre TEXT,
  plazo DATE,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_curso', 'cumplido')),
  estado_updated_at TIMESTAMPTZ,
  estado_updated_by_email TEXT,
  cerrado_en_sesion_id BIGINT REFERENCES public.eje_sesiones(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Índices ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_eje_sesiones_region_eje_fecha
  ON public.eje_sesiones (region_cod, eje_id, fecha DESC);

-- Un solo borrador vivo por (región, eje, provincia): "Nueva sesión" reabre
-- el borrador existente. Compensa que regional no tenga DELETE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_eje_sesiones_un_borrador
  ON public.eje_sesiones (region_cod, eje_id, COALESCE(provincia_cod, ''))
  WHERE estado = 'borrador';

CREATE INDEX IF NOT EXISTS idx_sesion_nomina_region_eje
  ON public.sesion_nomina (region_cod, eje_id) WHERE activo;

CREATE INDEX IF NOT EXISTS idx_sesion_asistencia_sesion
  ON public.sesion_asistencia (sesion_id);

-- Upsert limpio del checkbox de asistencia (evita duplicar miembro de nómina)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sesion_asistencia_nomina
  ON public.sesion_asistencia (sesion_id, nomina_id)
  WHERE nomina_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sesion_valores_metrica
  ON public.sesion_valores (metrica_id, sesion_id);

CREATE INDEX IF NOT EXISTS idx_sesion_apuntes_sesion
  ON public.sesion_apuntes (sesion_id);

CREATE INDEX IF NOT EXISTS idx_sesion_compromisos_abiertos
  ON public.sesion_compromisos (region_cod, eje_id, estado);

CREATE INDEX IF NOT EXISTS idx_sesion_compromisos_origen
  ON public.sesion_compromisos (sesion_origen_id);

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
-- Matriz (spec §5): staff (admin/editor) todo · regional SELECT/INSERT/UPDATE
-- en sus region_cods · DELETE solo staff · viewer sin policies = sin acceso.

ALTER TABLE public.eje_sesiones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesion_nomina      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesion_asistencia  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesion_valores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesion_apuntes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesion_compromisos ENABLE ROW LEVEL SECURITY;

-- 5a. Tablas con region_cod directo: eje_sesiones, sesion_nomina,
--     sesion_compromisos

-- eje_sesiones
DROP POLICY IF EXISTS eje_sesiones_staff_all ON public.eje_sesiones;
CREATE POLICY eje_sesiones_staff_all ON public.eje_sesiones
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS eje_sesiones_regional_select ON public.eje_sesiones;
CREATE POLICY eje_sesiones_regional_select ON public.eje_sesiones
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND eje_sesiones.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS eje_sesiones_regional_insert ON public.eje_sesiones;
CREATE POLICY eje_sesiones_regional_insert ON public.eje_sesiones
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND eje_sesiones.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS eje_sesiones_regional_update ON public.eje_sesiones;
CREATE POLICY eje_sesiones_regional_update ON public.eje_sesiones
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND eje_sesiones.region_cod = ANY(up.region_cods)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND eje_sesiones.region_cod = ANY(up.region_cods)));

-- sesion_nomina
DROP POLICY IF EXISTS sesion_nomina_staff_all ON public.sesion_nomina;
CREATE POLICY sesion_nomina_staff_all ON public.sesion_nomina
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS sesion_nomina_regional_select ON public.sesion_nomina;
CREATE POLICY sesion_nomina_regional_select ON public.sesion_nomina
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND sesion_nomina.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS sesion_nomina_regional_insert ON public.sesion_nomina;
CREATE POLICY sesion_nomina_regional_insert ON public.sesion_nomina
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND sesion_nomina.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS sesion_nomina_regional_update ON public.sesion_nomina;
CREATE POLICY sesion_nomina_regional_update ON public.sesion_nomina
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND sesion_nomina.region_cod = ANY(up.region_cods)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND sesion_nomina.region_cod = ANY(up.region_cods)));

-- sesion_compromisos
DROP POLICY IF EXISTS sesion_compromisos_staff_all ON public.sesion_compromisos;
CREATE POLICY sesion_compromisos_staff_all ON public.sesion_compromisos
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS sesion_compromisos_regional_select ON public.sesion_compromisos;
CREATE POLICY sesion_compromisos_regional_select ON public.sesion_compromisos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND sesion_compromisos.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS sesion_compromisos_regional_insert ON public.sesion_compromisos;
CREATE POLICY sesion_compromisos_regional_insert ON public.sesion_compromisos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND sesion_compromisos.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS sesion_compromisos_regional_update ON public.sesion_compromisos;
CREATE POLICY sesion_compromisos_regional_update ON public.sesion_compromisos
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND sesion_compromisos.region_cod = ANY(up.region_cods)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND sesion_compromisos.region_cod = ANY(up.region_cods)));

-- 5b. Tablas hijas (scope regional vía el padre eje_sesiones):
--     sesion_asistencia, sesion_valores, sesion_apuntes

-- sesion_asistencia
DROP POLICY IF EXISTS sesion_asistencia_staff_all ON public.sesion_asistencia;
CREATE POLICY sesion_asistencia_staff_all ON public.sesion_asistencia
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS sesion_asistencia_regional_select ON public.sesion_asistencia;
CREATE POLICY sesion_asistencia_regional_select ON public.sesion_asistencia
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_asistencia.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_asistencia_regional_insert ON public.sesion_asistencia;
CREATE POLICY sesion_asistencia_regional_insert ON public.sesion_asistencia
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_asistencia.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_asistencia_regional_update ON public.sesion_asistencia;
CREATE POLICY sesion_asistencia_regional_update ON public.sesion_asistencia
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_asistencia.sesion_id
                    AND s.region_cod = ANY(up.region_cods))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_asistencia.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

-- Regional SÍ necesita quitar filas de asistencia del borrador (desmarcar
-- invitado agregado por error). DELETE regional scopeado por el padre + solo
-- si la sesión sigue en borrador (cerrada la bloquea igual el trigger).
DROP POLICY IF EXISTS sesion_asistencia_regional_delete ON public.sesion_asistencia;
CREATE POLICY sesion_asistencia_regional_delete ON public.sesion_asistencia
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_asistencia.sesion_id
                    AND s.estado = 'borrador'
                    AND s.region_cod = ANY(up.region_cods))));

-- sesion_valores
DROP POLICY IF EXISTS sesion_valores_staff_all ON public.sesion_valores;
CREATE POLICY sesion_valores_staff_all ON public.sesion_valores
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS sesion_valores_regional_select ON public.sesion_valores;
CREATE POLICY sesion_valores_regional_select ON public.sesion_valores
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_valores.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_valores_regional_insert ON public.sesion_valores;
CREATE POLICY sesion_valores_regional_insert ON public.sesion_valores
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_valores.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_valores_regional_update ON public.sesion_valores;
CREATE POLICY sesion_valores_regional_update ON public.sesion_valores
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_valores.sesion_id
                    AND s.region_cod = ANY(up.region_cods))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_valores.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

-- Regional puede sacar un valor digitado por error mientras es borrador.
DROP POLICY IF EXISTS sesion_valores_regional_delete ON public.sesion_valores;
CREATE POLICY sesion_valores_regional_delete ON public.sesion_valores
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_valores.sesion_id
                    AND s.estado = 'borrador'
                    AND s.region_cod = ANY(up.region_cods))));

-- sesion_apuntes
DROP POLICY IF EXISTS sesion_apuntes_staff_all ON public.sesion_apuntes;
CREATE POLICY sesion_apuntes_staff_all ON public.sesion_apuntes
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS sesion_apuntes_regional_select ON public.sesion_apuntes;
CREATE POLICY sesion_apuntes_regional_select ON public.sesion_apuntes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_apuntes.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_apuntes_regional_insert ON public.sesion_apuntes;
CREATE POLICY sesion_apuntes_regional_insert ON public.sesion_apuntes
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_apuntes.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_apuntes_regional_update ON public.sesion_apuntes;
CREATE POLICY sesion_apuntes_regional_update ON public.sesion_apuntes
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_apuntes.sesion_id
                    AND s.region_cod = ANY(up.region_cods))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_apuntes.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

-- ── 6. Inmutabilidad de sesión cerrada ──────────────────────────────────────
-- Sesión cerrada = inmutable salvo admin (reapertura excepcional) y
-- service-role (la ruta /cerrar y el reintento escriben acta_path /
-- metricas_aplicadas SOBRE una sesión ya cerrada — el claim atómico cierra
-- primero). Guard auth.uid() IS NULL desde el día 1 (lección mig 028).

CREATE OR REPLACE FUNCTION public.eje_sesiones_bloquea_cerrada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF OLD.estado = 'cerrada' AND public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'sesión cerrada es inmutable (solo un administrador puede modificarla)'
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS eje_sesiones_bloquea_cerrada_trg ON public.eje_sesiones;
CREATE TRIGGER eje_sesiones_bloquea_cerrada_trg
  BEFORE UPDATE OR DELETE ON public.eje_sesiones
  FOR EACH ROW EXECUTE FUNCTION public.eje_sesiones_bloquea_cerrada();

-- Hijas: bloquear INSERT/UPDATE/DELETE si la sesión padre está cerrada.
-- sesion_compromisos queda FUERA a propósito: los compromisos viven entre
-- sesiones y su estado se sigue editando en sesiones futuras.
CREATE OR REPLACE FUNCTION public.sesion_hijas_bloquea_cerrada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid BIGINT;
  sestado TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  sid := CASE WHEN TG_OP = 'DELETE' THEN OLD.sesion_id ELSE NEW.sesion_id END;
  SELECT estado INTO sestado FROM public.eje_sesiones WHERE id = sid;
  IF sestado = 'cerrada' AND public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'la sesión está cerrada: sus datos son inmutables'
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS sesion_asistencia_bloquea_cerrada_trg ON public.sesion_asistencia;
CREATE TRIGGER sesion_asistencia_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.sesion_asistencia
  FOR EACH ROW EXECUTE FUNCTION public.sesion_hijas_bloquea_cerrada();

DROP TRIGGER IF EXISTS sesion_valores_bloquea_cerrada_trg ON public.sesion_valores;
CREATE TRIGGER sesion_valores_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.sesion_valores
  FOR EACH ROW EXECUTE FUNCTION public.sesion_hijas_bloquea_cerrada();

DROP TRIGGER IF EXISTS sesion_apuntes_bloquea_cerrada_trg ON public.sesion_apuntes;
CREATE TRIGGER sesion_apuntes_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.sesion_apuntes
  FOR EACH ROW EXECUTE FUNCTION public.sesion_hijas_bloquea_cerrada();

-- ── 7. Bucket comite-docs (privado) + policies de storage.objects ───────────
-- Path convención: {region_cod}/{sesion_id}/acta-{fecha}.pdf → el primer
-- folder es la región y se chequea con storage.foldername(name)[1].
-- En el MVP el acta la sube service-role (bypassa RLS), pero las policies
-- quedan definidas desde el día 1 (spec §5 — no repetir plan-regional).

INSERT INTO storage.buckets (id, name, public)
VALUES ('comite-docs', 'comite-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS comite_docs_staff_all ON storage.objects;
CREATE POLICY comite_docs_staff_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'comite-docs' AND public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (bucket_id = 'comite-docs' AND public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS comite_docs_regional_select ON storage.objects;
CREATE POLICY comite_docs_regional_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'comite-docs' AND EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND (storage.foldername(name))[1] = ANY(up.region_cods)));

DROP POLICY IF EXISTS comite_docs_regional_insert ON storage.objects;
CREATE POLICY comite_docs_regional_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comite-docs' AND EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND (storage.foldername(name))[1] = ANY(up.region_cods)));

DROP POLICY IF EXISTS comite_docs_regional_update ON storage.objects;
CREATE POLICY comite_docs_regional_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'comite-docs' AND EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND (storage.foldername(name))[1] = ANY(up.region_cods)))
  WITH CHECK (bucket_id = 'comite-docs' AND EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND (storage.foldername(name))[1] = ANY(up.region_cods)));
