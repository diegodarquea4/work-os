-- ============================================================================
-- 029_desalojo_planificacion.sql
--
-- Agrega la tabla `desalojo_planificacion` para soportar la nueva tab
-- "Planificación" del módulo Desalojos. Cada fila es un evento del
-- storytelling del caso (qué se hizo / qué estamos haciendo / qué viene),
-- con fecha puntual o rango. Independiente de `desalojo_seguimientos`
-- (que es log retrospectivo y hoy está vacía).
--
-- Decisiones de diseño:
--   - Modelo de fecha incompatible con `seguimientos` (DATE inicio + DATE
--     fin opcional vs TIMESTAMPTZ punto), justifica tabla aparte.
--   - Sin columna `estado` — se deriva en UI a partir de fechas vs hoy.
--   - `orden` server-side asignado por POST como max+1 por (prioridad, fecha)
--     dentro de transacción, evita race condition.
--   - Soft delete con `archivado_at` (mismo patrón que `desalojo_capas.activa`).
--   - RLS admin-only — consistente con el resto del módulo Desalojos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS desalojo_planificacion (
  id            BIGSERIAL    PRIMARY KEY,
  prioridad_id  INT          NOT NULL,             -- FK lógica a prioridades_territoriales.n
  capa_id       BIGINT       NULL,                 -- NULL = evento del caso global; si no, FK lógica a desalojo_capas.id
  titulo        TEXT         NOT NULL CHECK (length(btrim(titulo)) > 0),
  descripcion   TEXT         NULL,
  fecha_inicio  DATE         NOT NULL,
  fecha_fin     DATE         NULL,                 -- NULL = evento puntual; si no, >= fecha_inicio
  orden         INT          NOT NULL DEFAULT 0,   -- tie-breaker server-side para misma fecha_inicio
  archivado_at  TIMESTAMPTZ  NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by    TEXT         NULL,
  CONSTRAINT desalojo_planificacion_fechas_chk
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

-- Lookup principal: el GET filtra por prioridad_id y ordena por (fecha_inicio, orden).
CREATE INDEX IF NOT EXISTS idx_desalojo_planificacion_lookup
  ON desalojo_planificacion(prioridad_id, fecha_inicio, orden)
  WHERE archivado_at IS NULL;

-- Cubre el LEFT JOIN a desalojo_capas para el badge "capa archivada".
CREATE INDEX IF NOT EXISTS idx_desalojo_planificacion_capa
  ON desalojo_planificacion(capa_id)
  WHERE capa_id IS NOT NULL AND archivado_at IS NULL;

-- Trigger para mantener updated_at coherente (mismo patrón que desalojo_capas).
-- search_path explícito para evitar el warning function_search_path_mutable
-- del database linter (riesgo de hijack via schema search path).
CREATE OR REPLACE FUNCTION desalojo_planificacion_set_updated_at()
RETURNS TRIGGER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_desalojo_planificacion_updated_at ON desalojo_planificacion;
CREATE TRIGGER trg_desalojo_planificacion_updated_at
  BEFORE UPDATE ON desalojo_planificacion
  FOR EACH ROW
  EXECUTE FUNCTION desalojo_planificacion_set_updated_at();

-- RLS admin-only — consistente con desalojo_capas / desalojo_seguimientos / desalojo_documentos.
ALTER TABLE desalojo_planificacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "desalojo_planificacion_admin_all" ON desalojo_planificacion;
CREATE POLICY "desalojo_planificacion_admin_all" ON desalojo_planificacion
  FOR ALL
  USING      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));
