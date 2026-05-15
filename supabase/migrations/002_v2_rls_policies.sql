-- ==========================================================================
-- v2 RLS Policies — Public read access for browser queries
--
-- The v2 tables use RLS enabled by default in Supabase.
-- These policies grant SELECT to anon/authenticated for read-only tables.
-- Write access remains restricted to service_role (API routes).
-- ==========================================================================

-- Catálogos: public read
ALTER TABLE v2_regiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_regiones_read" ON v2_regiones FOR SELECT USING (true);

ALTER TABLE v2_fuentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_fuentes_read" ON v2_fuentes FOR SELECT USING (true);

ALTER TABLE v2_ejes_estrategicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_ejes_read" ON v2_ejes_estrategicos FOR SELECT USING (true);

ALTER TABLE v2_ministerios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_ministerios_read" ON v2_ministerios FOR SELECT USING (true);

-- Indicadores: public read
ALTER TABLE v2_indicadores_catalogo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_catalogo_read" ON v2_indicadores_catalogo FOR SELECT USING (true);

ALTER TABLE v2_indicadores_valores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_valores_read" ON v2_indicadores_valores FOR SELECT USING (true);

-- Pipeline: public read (for admin dashboard monitoring)
ALTER TABLE v2_indicadores_pipeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_pipeline_read" ON v2_indicadores_pipeline FOR SELECT USING (true);

ALTER TABLE v2_indicadores_pipeline_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_pipeline_log_read" ON v2_indicadores_pipeline_log FOR SELECT USING (true);

-- Iniciativas: public read
ALTER TABLE v2_iniciativas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_iniciativas_read" ON v2_iniciativas FOR SELECT USING (true);

ALTER TABLE v2_iniciativas_seguimiento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_seguimiento_read" ON v2_iniciativas_seguimiento FOR SELECT USING (true);

ALTER TABLE v2_iniciativas_semaforo_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_semaforo_log_read" ON v2_iniciativas_semaforo_log FOR SELECT USING (true);

ALTER TABLE v2_iniciativas_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_documentos_read" ON v2_iniciativas_documentos FOR SELECT USING (true);

-- Seguridad y proyectos: public read
ALTER TABLE v2_seguridad_semanal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_seguridad_read" ON v2_seguridad_semanal FOR SELECT USING (true);

ALTER TABLE v2_proyectos_inversion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_proyectos_read" ON v2_proyectos_inversion FOR SELECT USING (true);

-- Minutas log: public read
ALTER TABLE v2_minutas_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_minutas_log_read" ON v2_minutas_log FOR SELECT USING (true);
