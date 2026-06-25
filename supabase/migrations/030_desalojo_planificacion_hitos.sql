-- ============================================================================
-- 030_desalojo_planificacion_hitos.sql
--
-- Agrega soporte para "hitos" dentro de eventos de Planificación: un evento
-- top-level puede tener N sub-hitos con su propia fecha (puntual o rango)
-- que DEBE caer dentro del rango del padre.
--
-- Decisión de schema: self-reference (parent_id NULL = evento; NOT NULL =
-- hito). Razón: los campos son idénticos al evento (titulo, descripcion,
-- fecha_inicio, fecha_fin, orden, archivado_at), y mantener una sola tabla
-- evita proliferación. La distinción semántica vive en parent_id IS NULL.
--
-- Niveles permitidos: solo 2 (evento → hito). La validación de "el padre
-- no tiene padre" se hace en la API (POST/PATCH) — un CHECK constraint
-- cross-row es complejo y este invariante es trivial enforce en el handler.
--
-- ON DELETE CASCADE: borrar (hard-delete) un evento se lleva sus hitos.
-- Soft-delete del padre (archivado_at) NO cascadea — los hitos quedan
-- visibles si se "desarchiva" en el futuro. Hoy no exponemos desarchivar
-- así que en la práctica un padre soft-deleted oculta sus hitos vía el
-- filtro archivado_at IS NULL en el GET de la API.
-- ============================================================================

ALTER TABLE desalojo_planificacion
  ADD COLUMN IF NOT EXISTS parent_id BIGINT NULL
    REFERENCES desalojo_planificacion(id) ON DELETE CASCADE;

-- Índice para el GET que agrupa hitos por padre. Excluye archivados y
-- top-level events (parent_id NULL) — partial index pequeño.
CREATE INDEX IF NOT EXISTS idx_desalojo_planificacion_parent
  ON desalojo_planificacion(parent_id, fecha_inicio, orden)
  WHERE parent_id IS NOT NULL AND archivado_at IS NULL;

-- Comentario para futuros lectores del schema
COMMENT ON COLUMN desalojo_planificacion.parent_id IS
  'NULL = evento top-level. NOT NULL = hito de un evento. Solo 2 niveles (no nested hitos); validación en la API.';
