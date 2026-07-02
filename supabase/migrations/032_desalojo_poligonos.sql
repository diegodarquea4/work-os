-- ============================================================================
-- 032_desalojo_poligonos.sql
--
-- Agrega la tabla `desalojo_poligonos` para el nuevo botón "Mapa" en la tab
-- Avance del case view. Cada fila es un polígono dibujado (o importado
-- desde WKT) sobre la vista satelital del terreno del caso, con nombre y
-- color propios. Sirve para mostrar visualmente qué zonas se recuperaron,
-- cuáles están en disputa y cuáles quedan como objetivo.
--
-- Decisiones de diseño:
--   - Scope por caso (`prioridad_id`), no por capa. Los polígonos son
--     visibles desde cualquier capa que se abra. Decisión Diego 2026-07-02.
--   - Coords guardadas como JSONB con formato GeoJSON canónico
--     `[[lng, lat], [lng, lat], ...]` (ring exterior, cerrado). El WKT es
--     formato de INPUT del usuario; se parsea una vez al guardar.
--     Migración futura a PostGIS `geometry(Polygon, 4326)` no requiere
--     refactor del cliente — solo del server (parse/serialize).
--   - Sin columna `estado` — el nombre + color encoden semántica ("Recuperado",
--     "En disputa", "Objetivo") y dejan flexibilidad al equipo.
--   - Sin soft delete: el usuario borra, se borra. Si aparece necesidad de
--     historial, se suma `archivado_at` en migración separada.
--   - RLS admin-only — consistente con el resto del módulo Desalojos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS desalojo_poligonos (
  id            BIGSERIAL    PRIMARY KEY,
  prioridad_id  INT          NOT NULL,             -- FK lógica a prioridades_territoriales.n
  nombre        TEXT         NOT NULL CHECK (length(btrim(nombre)) > 0),
  color         TEXT         NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),   -- hex "#e53935"
  coords        JSONB        NOT NULL,             -- ring exterior GeoJSON: [[lng, lat], ...]
  descripcion   TEXT         NULL,
  orden         INT          NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by    TEXT         NULL
);

-- Lookup principal: el GET filtra por prioridad_id.
CREATE INDEX IF NOT EXISTS idx_desalojo_poligonos_lookup
  ON desalojo_poligonos(prioridad_id, orden, id);

-- Trigger para mantener updated_at coherente (mismo patrón que
-- desalojo_capas / desalojo_planificacion). search_path explícito para
-- evitar el warning function_search_path_mutable del linter (hijack risk).
CREATE OR REPLACE FUNCTION desalojo_poligonos_set_updated_at()
RETURNS TRIGGER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_desalojo_poligonos_updated_at ON desalojo_poligonos;
CREATE TRIGGER trg_desalojo_poligonos_updated_at
  BEFORE UPDATE ON desalojo_poligonos
  FOR EACH ROW
  EXECUTE FUNCTION desalojo_poligonos_set_updated_at();

-- RLS admin-only — consistente con el resto del módulo.
ALTER TABLE desalojo_poligonos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "desalojo_poligonos_admin_all" ON desalojo_poligonos;
CREATE POLICY "desalojo_poligonos_admin_all" ON desalojo_poligonos
  FOR ALL
  USING      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));
