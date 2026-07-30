-- 048 — Reporte de métricas por institución para el Comité Policial.
--
-- Reemplaza el modelo suma/pulso (metricas_eje → sesion_valores) EN LA SESIÓN
-- de comité por un reporte semanal POR INSTITUCIÓN (Carabineros, PDI, Armada,
-- Gendarmería), con descomposición en sub-valores libres (JSONB) y seguimiento
-- week-over-week reconstruible desde sesion_comite_valor de sesiones cerradas.
--
-- Catálogo POR REGIÓN (comite_metrica): cada región define sus ítems. Los
-- valores viven en sesion_comite_valor (hija de eje_sesiones, se sella al
-- cerrar vía el trigger existente sesion_hijas_bloquea_cerrada). Idempotente.

-- ── 1. Catálogo de ítems por región + institución ───────────────────────────
CREATE TABLE IF NOT EXISTS public.comite_metrica (
  id               BIGSERIAL PRIMARY KEY,
  region_cod       TEXT NOT NULL,
  institucion      TEXT NOT NULL CHECK (institucion IN ('carabineros','pdi','armada','gendarmeria')),
  nombre           TEXT NOT NULL,
  tipo             TEXT NOT NULL DEFAULT 'numerico' CHECK (tipo IN ('numerico','texto')),
  unidad           TEXT,
  orden            INT  NOT NULL DEFAULT 0,
  activo           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT,
  UNIQUE (region_cod, institucion, nombre)
);

CREATE INDEX IF NOT EXISTS idx_comite_metrica_lookup
  ON public.comite_metrica (region_cod, institucion, orden) WHERE activo;

ALTER TABLE public.comite_metrica ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier autenticado (es catálogo/definición, no dato sensible).
DROP POLICY IF EXISTS comite_metrica_select_any ON public.comite_metrica;
CREATE POLICY comite_metrica_select_any ON public.comite_metrica
  FOR SELECT TO authenticated USING (true);

-- Staff: todo.
DROP POLICY IF EXISTS comite_metrica_staff_all ON public.comite_metrica;
CREATE POLICY comite_metrica_staff_all ON public.comite_metrica
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- Regional: gestiona el catálogo de su(s) región(es).
DROP POLICY IF EXISTS comite_metrica_regional_insert ON public.comite_metrica;
CREATE POLICY comite_metrica_regional_insert ON public.comite_metrica
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND comite_metrica.region_cod = ANY(up.region_cods)));

DROP POLICY IF EXISTS comite_metrica_regional_update ON public.comite_metrica;
CREATE POLICY comite_metrica_regional_update ON public.comite_metrica
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND comite_metrica.region_cod = ANY(up.region_cods)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND comite_metrica.region_cod = ANY(up.region_cods)));

-- DELETE regional: solo ítems de su región. La FK sin CASCADE desde
-- sesion_comite_valor protege el histórico (no se puede borrar un ítem ya
-- reportado; en ese caso se usa activo=false).
DROP POLICY IF EXISTS comite_metrica_regional_delete ON public.comite_metrica;
CREATE POLICY comite_metrica_regional_delete ON public.comite_metrica
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND comite_metrica.region_cod = ANY(up.region_cods)));

-- ── 2. Valor reportado por (sesión × métrica) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.sesion_comite_valor (
  id            BIGSERIAL PRIMARY KEY,
  sesion_id     BIGINT NOT NULL REFERENCES public.eje_sesiones(id) ON DELETE CASCADE,
  metrica_id    BIGINT NOT NULL REFERENCES public.comite_metrica(id),
  valor_num     NUMERIC,                              -- métrica numérica (alimenta WoW)
  valor_texto   TEXT,                                 -- métrica de texto
  observaciones TEXT,                                 -- columna "Observaciones" del acta (año a la fecha / contexto)
  desglose      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- sub-valores libres [{etiqueta, valor}]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sesion_id, metrica_id)
);

-- Reconstrucción de la serie WoW de una métrica (mismo patrón que sesion_valores).
CREATE INDEX IF NOT EXISTS idx_sesion_comite_valor_metrica
  ON public.sesion_comite_valor (metrica_id, sesion_id);

ALTER TABLE public.sesion_comite_valor ENABLE ROW LEVEL SECURITY;

-- Staff: todo.
DROP POLICY IF EXISTS sesion_comite_valor_staff_all ON public.sesion_comite_valor;
CREATE POLICY sesion_comite_valor_staff_all ON public.sesion_comite_valor
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));

-- Regional: hija vía join al padre por region_cods (patrón sesion_valores).
DROP POLICY IF EXISTS sesion_comite_valor_regional_select ON public.sesion_comite_valor;
CREATE POLICY sesion_comite_valor_regional_select ON public.sesion_comite_valor
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_comite_valor.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_comite_valor_regional_insert ON public.sesion_comite_valor;
CREATE POLICY sesion_comite_valor_regional_insert ON public.sesion_comite_valor
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_comite_valor.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

DROP POLICY IF EXISTS sesion_comite_valor_regional_update ON public.sesion_comite_valor;
CREATE POLICY sesion_comite_valor_regional_update ON public.sesion_comite_valor
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_comite_valor.sesion_id
                    AND s.region_cod = ANY(up.region_cods))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_comite_valor.sesion_id
                    AND s.region_cod = ANY(up.region_cods))));

-- DELETE regional: solo mientras el padre es borrador (sacar un valor digitado
-- por error). Idéntico a sesion_valores_regional_delete.
DROP POLICY IF EXISTS sesion_comite_valor_regional_delete ON public.sesion_comite_valor;
CREATE POLICY sesion_comite_valor_regional_delete ON public.sesion_comite_valor
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'regional'
      AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                  WHERE s.id = sesion_comite_valor.sesion_id
                    AND s.estado = 'borrador'
                    AND s.region_cod = ANY(up.region_cods))));

-- Inmutabilidad al cerrar: reutiliza la función existente (mig 044) que lee
-- NEW/OLD.sesion_id y bloquea si el padre está cerrado (service-role pasa por
-- el guard auth.uid() IS NULL).
DROP TRIGGER IF EXISTS sesion_comite_valor_bloquea_cerrada_trg ON public.sesion_comite_valor;
CREATE TRIGGER sesion_comite_valor_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.sesion_comite_valor
  FOR EACH ROW EXECUTE FUNCTION public.sesion_hijas_bloquea_cerrada();

-- ── 3. Seed del catálogo de Valparaíso (piloto) ─────────────────────────────
-- Otras regiones parten con catálogo vacío (lo arman desde la UI).
INSERT INTO public.comite_metrica (region_cod, institucion, nombre, tipo, unidad, orden) VALUES
  ('V','carabineros','Detenidos durante la última semana','numerico','detenidos',1),
  ('V','carabineros','Vehículos incautados','numerico','vehículos',2),
  ('V','carabineros','Total de controles de identidad','numerico','controles',3),
  ('V','carabineros','Total de controles vehiculares','numerico','controles',4),
  ('V','carabineros','Droga decomisada','numerico','kg',5),
  ('V','carabineros','Armas de fuego decomisadas','numerico','armas',6),
  ('V','carabineros','Homicidios (semana)','numerico','homicidios',7),
  ('V','carabineros','Variación de DMCS','numerico','%',8),
  ('V','carabineros','Procedimientos destacados o de alta connotación','texto',NULL,9),
  ('V','pdi','Total controles migratorios','numerico','controles',1),
  ('V','pdi','Detenidos durante la última semana','numerico','detenidos',2),
  ('V','pdi','Vehículos incautados','numerico','vehículos',3),
  ('V','pdi','Denuncias','numerico','denuncias',4),
  ('V','pdi','Droga decomisada','numerico','kg',5),
  ('V','pdi','Armas decomisadas','numerico','armas',6),
  ('V','pdi','Homicidios (semana)','numerico','homicidios',7),
  ('V','gendarmeria','Reporte semanal','texto',NULL,1),
  ('V','armada','Reporte semanal','texto',NULL,1)
ON CONFLICT (region_cod, institucion, nombre) DO NOTHING;
