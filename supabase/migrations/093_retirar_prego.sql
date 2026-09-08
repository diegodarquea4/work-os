-- ============================================================================
-- 093_retirar_prego.sql — Se retira la sección PREGO (2026-09-08)
--
-- La matriz de seguimiento de la construcción del plan (prego_monitoreo, 16
-- regiones × 9 fases) y el diagnóstico COGRID "Prevención y Respuesta"
-- (prevencion_respuesta) cumplieron su ciclo: el plan ya está construido y
-- ninguna de las dos tablas se toca desde julio de 2026. Se elimina la UI, las
-- capacidades `sec.prego` / `prego.editar` y las policies de escritura.
--
-- Las tablas QUEDAN (dormidas, solo lectura) como respaldo histórico — mismo
-- criterio que la columna `prioridad` (mig 058). El DROP se difiere a una
-- limpieza posterior, sin apuro.
--
-- Nada de esto afecta el resto de "PREGO" en el panel: la minuta "Avance
-- PREGO" y las "iniciativas del PREGO" son el plan en sí, no su seguimiento.
-- ============================================================================

BEGIN;

-- 1) Sin escritura desde el cliente (la policy SELECT se conserva para que el
--    dato siga consultable si hace falta mirar el histórico).
DROP POLICY IF EXISTS prego_monitoreo_write_by_cap      ON public.prego_monitoreo;
DROP POLICY IF EXISTS prevencion_respuesta_write_by_cap ON public.prevencion_respuesta;

-- 2) Las capacidades salen del catálogo en el código; acá se limpian las filas
--    concedidas para que `capsMatchMirror` no vea a nadie como "personalizado"
--    solo por arrastrar una clave que ya no existe.
DELETE FROM public.user_capabilities
 WHERE capability_key IN ('sec.prego', 'prego.editar');

-- 3) Marca explícita del estado, para quien mire el esquema.
COMMENT ON TABLE public.prego_monitoreo IS
  'DORMIDA desde mig 093 (2026-09-08). Seguimiento histórico de la construcción del PREGO; sin UI ni escritura. DROP diferido.';
COMMENT ON TABLE public.prevencion_respuesta IS
  'DORMIDA desde mig 093 (2026-09-08). Diagnóstico COGRID "Prevención y Respuesta"; sin UI ni escritura. DROP diferido.';

COMMIT;
