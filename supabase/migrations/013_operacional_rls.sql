-- ==========================================================================
-- Migración 013 — RLS para tablas operativas
--
-- Contexto: el modelo de permisos ahora separa "operativo" (día a día,
-- abierto a todos los autenticados) de "estructural" (solo admin/editor).
-- Las tablas de seguimientos y documentos son operativas — cualquier
-- usuario autenticado debe poder leer y escribir. La distinción "lo propio
-- vs ajeno" para edición/eliminación se controla en cliente comparando
-- `autor` / `subido_por` con el email del usuario actual.
--
-- IMPORTANTE: las políticas son idempotentes (DROP IF EXISTS + CREATE).
-- Si encontrás policies viejas con otros nombres, después de correr esto
-- verificá con:
--   SELECT * FROM pg_policies
--    WHERE tablename IN ('seguimientos', 'documentos_prioridad')
--    ORDER BY tablename, policyname;
-- y limpiá manualmente las que sobren.
-- ==========================================================================

-- ── seguimientos ──────────────────────────────────────────────────────────

DO $$ BEGIN
  EXECUTE 'ALTER TABLE seguimientos ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP POLICY IF EXISTS "seguimientos_read"   ON seguimientos;
DROP POLICY IF EXISTS "seguimientos_insert" ON seguimientos;
DROP POLICY IF EXISTS "seguimientos_update" ON seguimientos;
DROP POLICY IF EXISTS "seguimientos_delete" ON seguimientos;

CREATE POLICY "seguimientos_read"   ON seguimientos FOR SELECT USING (true);
CREATE POLICY "seguimientos_insert" ON seguimientos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "seguimientos_update" ON seguimientos FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "seguimientos_delete" ON seguimientos FOR DELETE USING (auth.role() = 'authenticated');

-- ── documentos_prioridad ──────────────────────────────────────────────────

DO $$ BEGIN
  EXECUTE 'ALTER TABLE documentos_prioridad ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP POLICY IF EXISTS "documentos_read"   ON documentos_prioridad;
DROP POLICY IF EXISTS "documentos_insert" ON documentos_prioridad;
DROP POLICY IF EXISTS "documentos_update" ON documentos_prioridad;
DROP POLICY IF EXISTS "documentos_delete" ON documentos_prioridad;

CREATE POLICY "documentos_read"   ON documentos_prioridad FOR SELECT USING (true);
CREATE POLICY "documentos_insert" ON documentos_prioridad FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "documentos_update" ON documentos_prioridad FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "documentos_delete" ON documentos_prioridad FOR DELETE USING (auth.role() = 'authenticated');

-- ── semaforo_log ──────────────────────────────────────────────────────────
-- Tabla de auditoría de cambios de semáforo y % avance. Solo INSERT por
-- usuarios autenticados (no UPDATE/DELETE — es audit log).

DO $$ BEGIN
  EXECUTE 'ALTER TABLE semaforo_log ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP POLICY IF EXISTS "semaforo_log_read"   ON semaforo_log;
DROP POLICY IF EXISTS "semaforo_log_insert" ON semaforo_log;

CREATE POLICY "semaforo_log_read"   ON semaforo_log FOR SELECT USING (true);
CREATE POLICY "semaforo_log_insert" ON semaforo_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── Verificación post-deploy ──────────────────────────────────────────────
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN ('seguimientos', 'documentos_prioridad', 'semaforo_log')
-- ORDER BY tablename, cmd;
