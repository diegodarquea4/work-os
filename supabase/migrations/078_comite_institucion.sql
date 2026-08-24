-- 078 — Instituciones que reportan en el Comité Policial, POR REGIÓN.
--
-- Backlog 2026-08-21: hoy las instituciones son una lista cerrada de 4
-- (carabineros/pdi/armada/gendarmeria) por CHECK inline en comite_metrica.
-- Diego pidió que cada región pueda AGREGAR las suyas. Solución:
--
--  1. Se AFLOJA el CHECK de comite_metrica.institucion (pasa a TEXT libre).
--     Sólo amplía lo permitido → aditivo-seguro para el frontend viejo, que
--     sigue insertando las 4 claves base válidas.
--  2. Catálogo por región comite_institucion: las 4 base sembradas para las
--     16 regiones + agregables desde la UI. La clave (slug) es lo que se
--     guarda en comite_metrica.institucion.
--
-- RLS espejo de comite_metrica (mig 048): staff todo · regional gestiona su(s)
-- región(es) · viewer sin policies = sin acceso. Coherencia: quien edita las
-- métricas del comité edita también sus instituciones. Idempotente.

-- ── 1. Aflojar el CHECK de las 4 fijas (Postgres lo auto-nombra) ────────────
ALTER TABLE public.comite_metrica
  DROP CONSTRAINT IF EXISTS comite_metrica_institucion_check;

-- ── 2. Catálogo de instituciones por región ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comite_institucion (
  id               BIGSERIAL PRIMARY KEY,
  region_cod       TEXT NOT NULL,
  clave            TEXT NOT NULL,   -- slug guardado en comite_metrica.institucion
  nombre           TEXT NOT NULL,
  orden            INT  NOT NULL DEFAULT 0,
  activo           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT,
  UNIQUE (region_cod, clave)
);

CREATE INDEX IF NOT EXISTS idx_comite_institucion_region
  ON public.comite_institucion (region_cod, orden) WHERE activo;

ALTER TABLE public.comite_institucion ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier autenticado (catálogo/definición).
DROP POLICY IF EXISTS comite_institucion_select_any ON public.comite_institucion;
CREATE POLICY comite_institucion_select_any ON public.comite_institucion
  FOR SELECT TO authenticated USING (true);

-- Staff: todo.
DROP POLICY IF EXISTS comite_institucion_staff_all ON public.comite_institucion;
CREATE POLICY comite_institucion_staff_all ON public.comite_institucion
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- Regional: gestiona el catálogo de su(s) región(es).
DROP POLICY IF EXISTS comite_institucion_regional_insert ON public.comite_institucion;
CREATE POLICY comite_institucion_regional_insert ON public.comite_institucion
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND comite_institucion.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS comite_institucion_regional_update ON public.comite_institucion;
CREATE POLICY comite_institucion_regional_update ON public.comite_institucion
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND comite_institucion.region_cod = ANY(up.region_cods)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND comite_institucion.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS comite_institucion_regional_delete ON public.comite_institucion;
CREATE POLICY comite_institucion_regional_delete ON public.comite_institucion
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND comite_institucion.region_cod = ANY(up.region_cods)));

-- ── 3. Seed de las 4 base para las 16 regiones ──────────────────────────────
-- No hay tabla regions en la BD (REGIONS es TS) → cods literales.
INSERT INTO public.comite_institucion (region_cod, clave, nombre, orden)
SELECT r.cod, b.clave, b.nombre, b.orden
FROM (VALUES
    ('carabineros','Carabineros',1),
    ('pdi','PDI',2),
    ('armada','Armada',3),
    ('gendarmeria','Gendarmería',4)
  ) AS b(clave, nombre, orden)
CROSS JOIN (VALUES
    ('XV'),('I'),('II'),('III'),('IV'),('V'),('RM'),('VI'),
    ('VII'),('XVI'),('VIII'),('IX'),('XIV'),('X'),('XI'),('XII')
  ) AS r(cod)
ON CONFLICT (region_cod, clave) DO NOTHING;
