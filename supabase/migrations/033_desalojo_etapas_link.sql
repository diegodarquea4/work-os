-- ============================================================================
-- 033_desalojo_etapas_link.sql
--
-- Vincula la Planificación con el Mapa en el módulo Desalojos.
--
-- Cada evento top-level de `desalojo_planificacion` (parent_id IS NULL) pasa
-- a ser una "Etapa". Cada Etapa puede tener 1 o más polígonos asociados en el
-- mapa (relación 1:N — un polígono pertenece a lo sumo a una Etapa), y su color
-- deja de ser propiedad del polígono para ser propiedad de la Etapa (todos sus
-- polígonos lo heredan al renderizar).
--
-- Decisiones de diseño:
--   - `desalojo_poligonos.planificacion_id` = FK lógica a `desalojo_planificacion.id`
--     (top-level). NULL = polígono "Sin etapa" (legacy). Sin FK SQL, consistente
--     con el resto del módulo (prioridad_id/capa_id tampoco declaran FK).
--   - `desalojo_planificacion.color` = hex del Etapa; NULL en hitos (solo aplica
--     a top-level). Se backfillea en los eventos existentes ciclando la paleta
--     del drawer para que cada Etapa tenga color estable la primera vez que se
--     abre el mapa.
--   - Los polígonos NO se auto-migran a ninguna Etapa (quedan NULL / "Sin etapa").
--   - Aditiva e idempotente (IF NOT EXISTS + guard color IS NULL en el backfill).
-- ============================================================================

-- ── desalojo_poligonos: link a la Etapa ─────────────────────────────────────
ALTER TABLE desalojo_poligonos
  ADD COLUMN IF NOT EXISTS planificacion_id BIGINT NULL;   -- FK lógica a desalojo_planificacion.id (Etapa top-level); NULL = sin etapa

-- Lookup inverso: encontrar los polígonos de una Etapa (agrupación del sidebar).
CREATE INDEX IF NOT EXISTS idx_desalojo_poligonos_etapa
  ON desalojo_poligonos(planificacion_id);

-- ── desalojo_planificacion: color por Etapa ─────────────────────────────────
ALTER TABLE desalojo_planificacion
  ADD COLUMN IF NOT EXISTS color TEXT NULL
    CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$');   -- hex "#e53935"; solo top-level (Etapa)

-- Backfill determinista de color en Etapas existentes (top-level, no archivadas),
-- ciclando la paleta de 8 colores del drawer. Los hitos quedan con color NULL.
WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (PARTITION BY prioridad_id ORDER BY fecha_inicio, orden, id) - 1) AS rn
  FROM desalojo_planificacion
  WHERE parent_id IS NULL AND archivado_at IS NULL
),
palette AS (
  SELECT ARRAY[
    '#e53935','#f57c00','#fbc02d','#43a047',
    '#00acc1','#3949ab','#8e24aa','#616161'
  ]::text[] AS p
)
UPDATE desalojo_planificacion d
SET color = (SELECT p[(r.rn % 8) + 1] FROM palette)
FROM ranked r
WHERE d.id = r.id AND d.color IS NULL;
