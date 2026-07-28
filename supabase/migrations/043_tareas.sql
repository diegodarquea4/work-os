-- ============================================================================
-- 043_tareas.sql
--
-- Nuevo módulo "Tareas" dentro de la ficha de iniciativa (junto a Seguimiento,
-- Historial, Calendario, Documentos). Tabla de pendientes con responsable,
-- estado y fecha de vencimiento — esta última se muestra también en la
-- pestaña Calendario del modal.
--
-- Decisiones de diseño (calco de `seguimientos`, mig 023 + 026):
--   - `prioridad_id` es FK lógica a prioridades_territoriales.n (igual que
--     seguimientos/documentos_prioridad — NO a .id, ver nota en CLAUDE.md).
--   - RLS: SELECT cualquier autenticado (world-readable, igual al resto del
--     panel). INSERT cualquier autenticado (mig 026 abrió esto para que
--     viewer también pueda cargar). UPDATE/DELETE: autor O admin/editor.
--   - `autor` se auto-puebla con el email de quien crea la tarea — es la
--     base para "mío vs ajeno" en la UI (mismo patrón que seguimientos).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tareas (
  id                BIGSERIAL   PRIMARY KEY,
  prioridad_id      INT         NOT NULL,
  tarea             TEXT        NOT NULL,
  responsable       TEXT,
  estado            TEXT        NOT NULL DEFAULT 'no_iniciada'
                        CHECK (estado IN ('completada', 'en_proceso', 'bloqueada', 'no_iniciada')),
  fecha_vencimiento DATE,
  comentarios       TEXT,
  autor             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tareas_lookup
  ON public.tareas(prioridad_id, fecha_vencimiento);

ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tareas_select ON public.tareas;
CREATE POLICY tareas_select ON public.tareas
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS tareas_insert_any_authenticated ON public.tareas;
CREATE POLICY tareas_insert_any_authenticated ON public.tareas
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS tareas_update_owner_or_staff ON public.tareas;
CREATE POLICY tareas_update_owner_or_staff ON public.tareas
  FOR UPDATE TO authenticated
  USING (
    autor = auth.jwt() ->> 'email'
    OR public.current_user_role() IN ('admin', 'editor')
  )
  WITH CHECK (
    autor = auth.jwt() ->> 'email'
    OR public.current_user_role() IN ('admin', 'editor')
  );

DROP POLICY IF EXISTS tareas_delete_owner_or_staff ON public.tareas;
CREATE POLICY tareas_delete_owner_or_staff ON public.tareas
  FOR DELETE TO authenticated
  USING (
    autor = auth.jwt() ->> 'email'
    OR public.current_user_role() IN ('admin', 'editor')
  );
