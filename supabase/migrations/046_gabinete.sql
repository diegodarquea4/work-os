-- ============================================================================
-- 046_gabinete.sql — Generaliza el módulo Sesiones (mig 044) a instancias sin
-- eje: el Gabinete Regional (spec docs/spec-modulo-gabinete-regional.md).
--
-- Ventana de nacimiento (spec §4): a la fecha solo existen sesiones borrador
-- de prueba, así que los ALTER son baratos y sin riesgo de datos — las filas
-- existentes son todas instancia='eje' con eje_id NOT NULL y satisfacen los
-- CHECK e índices nuevos por construcción.
--
-- Semántica de `instancia` (spec §5.3 — leerla dos veces):
--   · instancia dice DÓNDE SE GESTIONA el compromiso/sesión/nómina.
--   · Escalamiento: compromiso de comité (instancia='eje') con
--     escalado_a_gabinete=true aparece ADEMÁS en el gabinete sin cambiar de
--     instancia (el comité lo sigue viendo).
--   · Mandato: compromiso creado EN sesión de gabinete dirigido a un comité
--     se inserta con instancia='eje' + eje_id destino + sesion_origen_id de
--     la sesión de gabinete. Sin tabla ni estado nuevo.
--
-- Todo idempotente (patrón del repo).
-- ============================================================================

-- ── 1. eje_sesiones — instancia sin eje ─────────────────────────────────────

ALTER TABLE public.eje_sesiones
  ADD COLUMN IF NOT EXISTS instancia TEXT NOT NULL DEFAULT 'eje'
    CHECK (instancia IN ('eje', 'gabinete'));
ALTER TABLE public.eje_sesiones ALTER COLUMN eje_id DROP NOT NULL;
ALTER TABLE public.eje_sesiones DROP CONSTRAINT IF EXISTS eje_sesiones_instancia_eje_chk;
ALTER TABLE public.eje_sesiones ADD CONSTRAINT eje_sesiones_instancia_eje_chk CHECK (
  (instancia = 'eje'      AND eje_id IS NOT NULL) OR
  (instancia = 'gabinete' AND eje_id IS NULL)
);

-- UNIQUE "1 borrador por instancia": DOS índices parciales en lugar de un
-- COALESCE(eje_id, -1). (a) el índice de eje queda con la misma forma que el
-- actual → regresión cero para los comités; (b) la llave del gabinete NO
-- incluye eje_id (el CHECK lo fuerza NULL — un sentinel sería ruido);
-- (c) cada índice declara su invariante legible.
DROP INDEX IF EXISTS public.uq_eje_sesiones_un_borrador;
CREATE UNIQUE INDEX IF NOT EXISTS uq_eje_sesiones_un_borrador_eje
  ON public.eje_sesiones (region_cod, eje_id, COALESCE(provincia_cod, ''))
  WHERE estado = 'borrador' AND instancia = 'eje';
CREATE UNIQUE INDEX IF NOT EXISTS uq_eje_sesiones_un_borrador_gabinete
  ON public.eje_sesiones (region_cod, COALESCE(provincia_cod, ''))
  WHERE estado = 'borrador' AND instancia = 'gabinete';

CREATE INDEX IF NOT EXISTS idx_eje_sesiones_region_instancia_fecha
  ON public.eje_sesiones (region_cod, instancia, fecha DESC);

-- ── 2. sesion_nomina — mismo tratamiento ────────────────────────────────────
-- La nómina del gabinete (seremis + equipo DPR) se carga en la misma pantalla
-- de nómina, que recibe la instancia como prop.

ALTER TABLE public.sesion_nomina
  ADD COLUMN IF NOT EXISTS instancia TEXT NOT NULL DEFAULT 'eje'
    CHECK (instancia IN ('eje', 'gabinete'));
ALTER TABLE public.sesion_nomina ALTER COLUMN eje_id DROP NOT NULL;
ALTER TABLE public.sesion_nomina DROP CONSTRAINT IF EXISTS sesion_nomina_instancia_eje_chk;
ALTER TABLE public.sesion_nomina ADD CONSTRAINT sesion_nomina_instancia_eje_chk CHECK (
  (instancia = 'eje'      AND eje_id IS NOT NULL) OR
  (instancia = 'gabinete' AND eje_id IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_sesion_nomina_region_instancia
  ON public.sesion_nomina (region_cod, instancia) WHERE activo;

-- ── 3. sesion_compromisos — instancia + vínculo a iniciativa + escalamiento ─

ALTER TABLE public.sesion_compromisos
  ADD COLUMN IF NOT EXISTS instancia TEXT NOT NULL DEFAULT 'eje'
    CHECK (instancia IN ('eje', 'gabinete')),
  -- Vínculo a iniciativa por LLAVE ESTABLE (prioridades_territoriales.id,
  -- BIGINT PK — NUNCA n, que no es UNIQUE; ver CLAUDE.md "Llave estable").
  ADD COLUMN IF NOT EXISTS prioridad_id BIGINT REFERENCES public.prioridades_territoriales(id),
  -- Escalamiento comité → gabinete. Se marca solo desde la sesión del comité.
  ADD COLUMN IF NOT EXISTS escalado_a_gabinete BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalado_en_sesion_id BIGINT REFERENCES public.eje_sesiones(id);
ALTER TABLE public.sesion_compromisos ALTER COLUMN eje_id DROP NOT NULL;
ALTER TABLE public.sesion_compromisos DROP CONSTRAINT IF EXISTS sesion_compromisos_instancia_eje_chk;
ALTER TABLE public.sesion_compromisos ADD CONSTRAINT sesion_compromisos_instancia_eje_chk CHECK (
  (instancia = 'eje'      AND eje_id IS NOT NULL) OR
  (instancia = 'gabinete' AND eje_id IS NULL)
);

-- Bandeja de preparación del gabinete: trabas escaladas abiertas por región.
CREATE INDEX IF NOT EXISTS idx_sesion_compromisos_escalados
  ON public.sesion_compromisos (region_cod)
  WHERE escalado_a_gabinete AND estado != 'cumplido';
-- Ficha de iniciativa: compromisos vinculados.
CREATE INDEX IF NOT EXISTS idx_sesion_compromisos_prioridad
  ON public.sesion_compromisos (prioridad_id) WHERE prioridad_id IS NOT NULL;
-- Zona 1 del gabinete: compromisos propios por región y estado.
CREATE INDEX IF NOT EXISTS idx_sesion_compromisos_gabinete_abiertos
  ON public.sesion_compromisos (region_cod, estado) WHERE instancia = 'gabinete';

-- ── 4. sesion_iniciativas — la única tabla nueva de datos ───────────────────
-- Agenda + snapshot de qué iniciativas trató una sesión de gabinete y el
-- acuerdo de cada una (reemplaza a la zona de indicadores del comité).
-- El acuerdo se escribe DURANTE la sesión (borrador, client-side); los
-- snapshots semaforo/pct los escribe el cierre server-side. created_at da
-- orden estable en UI y acta; sin columna `orden` (no hay UX de reordenar).

CREATE TABLE IF NOT EXISTS public.sesion_iniciativas (
  id BIGSERIAL PRIMARY KEY,
  sesion_id BIGINT NOT NULL REFERENCES public.eje_sesiones(id) ON DELETE CASCADE,
  prioridad_id BIGINT NOT NULL REFERENCES public.prioridades_territoriales(id),  -- id, NO n
  semaforo_al_momento TEXT,       -- snapshot server-side al cerrar
  pct_avance_al_momento NUMERIC,  -- snapshot server-side al cerrar
  acuerdo TEXT,                   -- qué resolvió el gabinete sobre esta iniciativa
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sesion_id, prioridad_id)
);
CREATE INDEX IF NOT EXISTS idx_sesion_iniciativas_sesion
  ON public.sesion_iniciativas (sesion_id);
CREATE INDEX IF NOT EXISTS idx_sesion_iniciativas_prioridad
  ON public.sesion_iniciativas (prioridad_id);

-- ── 5. region_config — habilitación por región ──────────────────────────────
-- El flag de comités vive en region_ejes.sesiones_habilitadas (región+eje);
-- el gabinete no tiene eje. Habilitar el piloto = INSERT de datos, no deploy.
-- Descartado a propósito (spec §5.5): fila sintética "Gabinete" en
-- region_ejes — contaminaría "Avance por eje" y todos sus consumidores.

CREATE TABLE IF NOT EXISTS public.region_config (
  region_cod TEXT PRIMARY KEY,
  gabinete_habilitado BOOLEAN NOT NULL DEFAULT false,
  gabinete_nombre TEXT NOT NULL DEFAULT 'Gabinete Regional'
);

-- ── 6. RLS ──────────────────────────────────────────────────────────────────
-- Las filas instancia='gabinete' de las tablas existentes heredan las
-- policies de la 044 sin cambios (scopean por region_cod, no por eje).
-- Las tablas nuevas siguen la misma matriz: staff todo; regional sus
-- region_cods; viewer sin acceso (sin policies).

ALTER TABLE public.sesion_iniciativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.region_config      ENABLE ROW LEVEL SECURITY;

-- sesion_iniciativas: hija vía padre (patrón sesion_valores de la 044).
-- Regional necesita INSERT/UPDATE durante el borrador (el acuerdo se escribe
-- en vivo) y DELETE mientras borrador (sacar una iniciativa de la agenda).
DROP POLICY IF EXISTS sesion_iniciativas_staff_all ON public.sesion_iniciativas;
CREATE POLICY sesion_iniciativas_staff_all ON public.sesion_iniciativas
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS sesion_iniciativas_regional_select ON public.sesion_iniciativas;
CREATE POLICY sesion_iniciativas_regional_select ON public.sesion_iniciativas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_iniciativas.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_iniciativas_regional_insert ON public.sesion_iniciativas;
CREATE POLICY sesion_iniciativas_regional_insert ON public.sesion_iniciativas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_iniciativas.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_iniciativas_regional_update ON public.sesion_iniciativas;
CREATE POLICY sesion_iniciativas_regional_update ON public.sesion_iniciativas
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_iniciativas.sesion_id
                    AND s.region_cod = ANY(up.region_cods))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_iniciativas.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

-- Regional puede sacar una iniciativa de la agenda mientras es borrador.
DROP POLICY IF EXISTS sesion_iniciativas_regional_delete ON public.sesion_iniciativas;
CREATE POLICY sesion_iniciativas_regional_delete ON public.sesion_iniciativas
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_iniciativas.sesion_id
                    AND s.estado = 'borrador'
                    AND s.region_cod = ANY(up.region_cods))));

-- region_config: SELECT cualquier autenticado (es configuración, no datos de
-- coordinación — la UI necesita saber si el módulo está habilitado incluso
-- para decidir no mostrarlo). Write: staff + regional su región.
DROP POLICY IF EXISTS region_config_select_any ON public.region_config;
CREATE POLICY region_config_select_any ON public.region_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS region_config_staff_all ON public.region_config;
CREATE POLICY region_config_staff_all ON public.region_config
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

DROP POLICY IF EXISTS region_config_regional_insert ON public.region_config;
CREATE POLICY region_config_regional_insert ON public.region_config
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND region_config.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS region_config_regional_update ON public.region_config;
CREATE POLICY region_config_regional_update ON public.region_config
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND region_config.region_cod = ANY(up.region_cods)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND region_config.region_cod = ANY(up.region_cods)));
-- DELETE: solo staff (vía region_config_staff_all).

-- ── 7. Inmutabilidad post-cierre ────────────────────────────────────────────
-- sesion_iniciativas SÍ se bloquea al cerrar: el acuerdo se sella con el
-- acta. La función existente sesion_hijas_bloquea_cerrada() sirve tal cual
-- (lee NEW/OLD.sesion_id); su guard auth.uid() IS NULL deja pasar el
-- snapshot server-side del cierre (escribe semaforo/pct SOBRE una sesión ya
-- cerrada por el claim atómico — misma película que acta_path en la 044).
-- eje_sesiones_bloquea_cerrada_trg es table-level → cubre filas gabinete.

DROP TRIGGER IF EXISTS sesion_iniciativas_bloquea_cerrada_trg ON public.sesion_iniciativas;
CREATE TRIGGER sesion_iniciativas_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.sesion_iniciativas
  FOR EACH ROW EXECUTE FUNCTION public.sesion_hijas_bloquea_cerrada();
