-- 016_add_tags_iniciativas.sql
-- Campo tags multi-valor en iniciativas. Sin tabla catalogo separada: el control
-- de qué tags entran lo da la aprobación de propuestas (igual que cualquier
-- otro estructural). Para borrar tags, admin/editor edita la ficha; el parser
-- mantiene la política skip-si-vacío (celda vacía no borra).

ALTER TABLE prioridades_territoriales
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- Index GIN para queries .contains() / .overlaps() en filtros multi-tag y para
-- el SELECT DISTINCT unnest() que alimenta dropdowns derivados del uso.
CREATE INDEX IF NOT EXISTS idx_prioridades_tags
  ON prioridades_territoriales USING GIN(tags);
