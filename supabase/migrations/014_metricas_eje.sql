-- ==========================================================================
-- Migración 014 — Métricas por eje (planificación cuantitativa por región)
--
-- Cada región puede definir métricas objetivo asociadas a un eje regional.
-- Modelo de "compromiso": admin/editor crea la métrica con su objetivo;
-- el delegado regional (cualquier autenticado) reporta el valor actual.
--
-- Clave compuesta lógica: (region_cod, eje). El campo `eje` es un string
-- libre coherente con cómo el resto del sistema lo trata (deriva del
-- catastro de iniciativas, sin tabla normalizada).
--
-- IMPORTANTE: las políticas son idempotentes (DROP IF EXISTS + CREATE).
-- ==========================================================================

CREATE TABLE IF NOT EXISTS metricas_eje (
  id                       BIGSERIAL PRIMARY KEY,
  region_cod               TEXT        NOT NULL,
  eje                      TEXT        NOT NULL,
  titulo                   TEXT        NOT NULL,
  descripcion              TEXT,
  objetivo                 NUMERIC     NOT NULL,
  valor_actual             NUMERIC,                  -- null = "no reportado aún"
  unidad                   TEXT,                     -- libre, ej "%", "casos", "km"
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email         TEXT,
  valor_updated_by_email   TEXT,                     -- quién reportó el último valor
  valor_updated_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_metricas_eje_lookup
  ON metricas_eje (region_cod, eje, created_at DESC);

ALTER TABLE metricas_eje ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metricas_read"   ON metricas_eje;
DROP POLICY IF EXISTS "metricas_insert" ON metricas_eje;
DROP POLICY IF EXISTS "metricas_update" ON metricas_eje;
DROP POLICY IF EXISTS "metricas_delete" ON metricas_eje;

-- Lectura: cualquier autenticado.
CREATE POLICY "metricas_read" ON metricas_eje
  FOR SELECT USING (true);

-- Crear: solo admin/editor (definir la métrica + su objetivo).
CREATE POLICY "metricas_insert" ON metricas_eje
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin','editor')
    )
  );

-- Borrar: solo admin/editor.
CREATE POLICY "metricas_delete" ON metricas_eje
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin','editor')
    )
  );

-- Update: cualquier autenticado. La distinción "solo valor_actual" vs
-- campos estructurales se controla en cliente (mismo modelo que
-- seguimientos / documentos / pct_avance).
CREATE POLICY "metricas_update" ON metricas_eje
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ── Verificación ──────────────────────────────────────────────────────────
-- SELECT COUNT(*) FROM metricas_eje;
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'metricas_eje';
