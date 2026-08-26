-- ════════════════════════════════════════════════════════════════════════════
-- 085 — Re-escopar sobre-concesiones de usuarios regionales (deuda del bug de
--        "región por defecto = Todas" en el editor de Permisos)
--
-- Contexto: antes del fix 5fe756c (defaultRegionScopeForCap), conceder una
-- capacidad a un usuario en Usuarios → Permisos la dejaba en `region_cod='*'`
-- (todas las regiones) por defecto. Para usuarios REGIONALES eso los habilitó a
-- OPERAR en las 16 regiones en caps que debían ser solo la suya (metrica.definir,
-- region.gestionar_ejes, desalojos.*, iniciativa.editar_*/eliminar/gestionar_ajeno,
-- comite.*, docs_regionales.gestionar, dashboard.importar, region.minuta_generar).
--
-- Fix (fail-closed, espeja defaultRegionScopeForCap): para cada usuario con
-- role='regional' y region_cods no vacío, reemplaza sus filas `'*'` de caps
-- OPERATIVAS por una fila por cada una de sus region_cods. Se PRESERVAN en '*':
--   - todas las `sec.*` (visibilidad de sección, se chequean sin región), y
--   - las globales que el preset regional marca 'all': dashboard.exportar,
--     iniciativa.marcar_foco / seguimiento_crear / documento_subir,
--     planificacion.exportar_pdf.
--
-- Seguro: un regional solo ve/opera su región (RLS de lectura + escritura), así
-- que acotar el cap a su región NO le quita acceso real; solo remueve el permiso
-- latente sobre las otras 15. Idempotente (ON CONFLICT DO NOTHING + el DELETE
-- usa el mismo predicado). Verificado el alcance con un preview antes de aplicar
-- (2026-08-26): ~22 filas '*' operativas en un puñado de regionales; ninguna cap
-- transversal/nacional (usuarios.gestionar, comite.metricas.catalogo, seia_sync,
-- mapa.autoridades) estaba en el conjunto.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO public.user_capabilities (user_id, capability_key, region_cod)
SELECT uc.user_id, uc.capability_key, unnest(up.region_cods)
FROM public.user_capabilities uc
JOIN public.user_profiles up ON up.id = uc.user_id
WHERE up.role = 'regional'
  AND array_length(up.region_cods, 1) >= 1
  AND uc.region_cod = '*'
  AND uc.capability_key NOT LIKE 'sec.%'
  AND uc.capability_key NOT IN (
    'dashboard.exportar','iniciativa.marcar_foco','iniciativa.seguimiento_crear',
    'iniciativa.documento_subir','planificacion.exportar_pdf'
  )
ON CONFLICT (user_id, capability_key, region_cod) DO NOTHING;

DELETE FROM public.user_capabilities uc
USING public.user_profiles up
WHERE up.id = uc.user_id
  AND up.role = 'regional'
  AND array_length(up.region_cods, 1) >= 1
  AND uc.region_cod = '*'
  AND uc.capability_key NOT LIKE 'sec.%'
  AND uc.capability_key NOT IN (
    'dashboard.exportar','iniciativa.marcar_foco','iniciativa.seguimiento_crear',
    'iniciativa.documento_subir','planificacion.exportar_pdf'
  );

COMMIT;
