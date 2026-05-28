-- ==========================================================================
-- Fix: minuta_cache.generated_by bloqueaba la eliminación de usuarios
--
-- La FK minuta_cache_generated_by_fkey estaba como ON DELETE NO ACTION,
-- así que cualquier admin/editor que hubiera generado una minuta con IA
-- no podía ser eliminado (auth.admin.deleteUser fallaba con "Database
-- error deleting user").
--
-- Cambio: ON DELETE SET NULL.
-- Las minutas cacheadas sobreviven (la cache es por región/tipo/fecha,
-- otros usuarios pueden seguir descargándolas hoy), solo se pierde la
-- atribución del usuario que las generó.
-- ==========================================================================

ALTER TABLE public.minuta_cache
  DROP CONSTRAINT minuta_cache_generated_by_fkey,
  ADD  CONSTRAINT minuta_cache_generated_by_fkey
       FOREIGN KEY (generated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── Verificación ───────────────────────────────────────────────────────────
-- Debe devolver on_delete = SET NULL
-- SELECT conname,
--        CASE confdeltype
--          WHEN 'n' THEN 'SET NULL' WHEN 'c' THEN 'CASCADE'
--          WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
--        END AS on_delete
-- FROM pg_constraint
-- WHERE conname = 'minuta_cache_generated_by_fkey';
