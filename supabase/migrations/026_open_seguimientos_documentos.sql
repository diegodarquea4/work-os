-- ==========================================================================
-- Abrir carga de Seguimientos y Documentos a todos los usuarios autenticados.
--
-- Decisión de producto (Diego, 2026-06-18):
--   Cualquier usuario autenticado (incluido viewer) debe poder cargar
--   Seguimientos y Documentos en cualquier iniciativa. La restricción de
--   mig 023 (admin/editor/regional) excluía a viewer e indirectamente a
--   usuarios con role NULL o sin fila en user_profiles → quedaban bloqueados
--   con el error críptico "new row violates row-level security policy".
--
-- Alcance:
--   1. Tablas: seguimientos + documentos_prioridad — INSERT abierto a
--      cualquier authenticated. UPDATE/DELETE se mantienen como en mig 023
--      (autor O staff). viewer puede crear y editar lo suyo, no de otros.
--   2. Storage: bucket project-docs — sin policy hoy (RLS lo bloquea por
--      default). Agregamos SELECT abierto + INSERT authenticated +
--      UPDATE/DELETE owner-o-staff.
--
-- NO se toca:
--   - plan-regional: bucket también sin policy, pero fuera del scope del
--     reporte. Si aparecen reportes ahí, abrir en una migración separada.
--   - SELECT en tablas: ya world-readable a authenticated (mig 023 no las
--     tocó).
--   - Otras tablas con RLS por rol (prioridades_territoriales, metricas_eje,
--     region_ejes, prego_monitoreo): siguen como en mig 023.
-- ==========================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. seguimientos.INSERT
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS seguimientos_insert_by_role ON public.seguimientos;

CREATE POLICY seguimientos_insert_any_authenticated ON public.seguimientos
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. documentos_prioridad.INSERT
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS documentos_insert_by_role ON public.documentos_prioridad;

CREATE POLICY documentos_insert_any_authenticated ON public.documentos_prioridad
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Storage: bucket project-docs
-- ─────────────────────────────────────────────────────────────────────────────
-- Bucket es public=true, así que GET via getPublicUrl no chequea RLS. Pero
-- INSERT, UPDATE y DELETE sí. Sin policy → cualquier upload falla.

DROP POLICY IF EXISTS project_docs_select_any ON storage.objects;
DROP POLICY IF EXISTS project_docs_insert_any_authenticated ON storage.objects;
DROP POLICY IF EXISTS project_docs_update_staff ON storage.objects;
DROP POLICY IF EXISTS project_docs_delete_owner_or_staff ON storage.objects;

CREATE POLICY project_docs_select_any ON storage.objects
  FOR SELECT
  USING (bucket_id = 'project-docs');

CREATE POLICY project_docs_insert_any_authenticated ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'project-docs' AND auth.uid() IS NOT NULL);

CREATE POLICY project_docs_update_staff ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'project-docs'
    AND public.current_user_role() IN ('admin', 'editor')
  )
  WITH CHECK (
    bucket_id = 'project-docs'
    AND public.current_user_role() IN ('admin', 'editor')
  );

CREATE POLICY project_docs_delete_owner_or_staff ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'project-docs'
    AND (owner = auth.uid() OR public.current_user_role() IN ('admin', 'editor'))
  );
