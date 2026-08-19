-- ============================================================================
-- 073_mapa_autoridades_capability.sql — capacidad `mapa.autoridades`
--
-- Nueva capacidad de UI: ver el modo «Autoridades» del Mapa (colores por bloque
-- político). Es admin-por-defecto en el preset (lib/permissions.ts) y concedible
-- a usuarios puntuales —incluidos regionales— desde Usuarios→Permisos.
--
-- Gate SOLO de UI: los JSON del snapshot viven en public/ (datos electorales
-- públicos) → NO hay RLS ni tabla que proteger. Esta migración solo hace el
-- BACKFILL de datos: sin ella los admins ACTUALES perderían el toggle, porque ya
-- tienen filas espejo en user_capabilities (backfill de Fase 0 corrido) y por eso
-- /api/me lee la tabla en vez del preset.
--
-- Se la agregamos SOLO a los admins que YA tienen filas. Los admins sin filas
-- (edge) caen al espejo del rol en loadCapabilities, que ya incluye la nueva cap
-- vía el preset actualizado → agregarles una única fila los sacaría del fallback
-- y les quitaría el resto de sus capacidades. Idempotente.
-- ============================================================================

INSERT INTO public.user_capabilities (user_id, capability_key, region_cod)
SELECT up.id, 'mapa.autoridades', '*'
FROM public.user_profiles up
WHERE up.role = 'admin'
  AND EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = up.id)
ON CONFLICT (user_id, capability_key, region_cod) DO NOTHING;
