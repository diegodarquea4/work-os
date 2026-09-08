-- ============================================================================
-- 097_avance_estado_registrado.sql
--
-- Cada avance de un proyecto privado puede, opcionalmente, dejar registrado
-- un cambio de estado del permiso al que se refiere (mig 088: PillField de
-- "Estado del permiso" en el form de alta). Hasta ahora ese cambio solo
-- quedaba en `comite_economico_proyecto_permiso.estado` (el estado ACTUAL,
-- sin historial) — no había forma de saber, mirando la bitácora de avances
-- de un permiso, en cuál de ellos cambió el estado y a qué.
--
-- `estado_permiso_registrado` es un snapshot histórico: el estado que ESE
-- avance dejó registrado al crearse. NULL = este avance no tocó el estado
-- del permiso (o es un avance general, sin permiso asociado).
-- ============================================================================

ALTER TABLE public.comite_economico_proyecto_seguimiento
  ADD COLUMN IF NOT EXISTS estado_permiso_registrado TEXT
    CHECK (estado_permiso_registrado IN ('pendiente', 'otorgado', 'frenado'));
