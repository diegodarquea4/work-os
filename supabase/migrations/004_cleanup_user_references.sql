-- ==========================================================================
-- Función auxiliar para eliminar usuarios admin sin que las FKs huérfanas
-- bloqueen la baja en auth.users.
--
-- Problema: cuando un usuario sube un archivo a Supabase Storage, la fila
-- en storage.objects queda con owner = auth.uid(). Esa FK contra auth.users
-- impide eliminarlo con auth.admin.deleteUser() y devuelve el error genérico
-- "Database error deleting user". Lo mismo aplica a public.user_profiles.id.
--
-- Esta función limpia ambas referencias en una sola transacción. El route
-- DELETE /api/admin/users/[id] la llama vía rpc() antes del auth delete.
--
-- Política aplicada:
--   - storage.objects.owner: SET NULL (los archivos sobreviven sin atribución)
--   - public.user_profiles:  DELETE  (el perfil deja de existir)
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.cleanup_user_references(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  -- 1. Liberar ownership de archivos en Supabase Storage
  --    (FK storage.objects.owner -> auth.users.id)
  UPDATE storage.objects
  SET owner = NULL
  WHERE owner = target_user_id;

  -- 2. Borrar el perfil
  --    (FK public.user_profiles.id -> auth.users.id)
  DELETE FROM public.user_profiles
  WHERE id = target_user_id;
END;
$$;

-- Permitir solo al service_role (route handlers) llamarla.
REVOKE ALL ON FUNCTION public.cleanup_user_references(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_user_references(uuid) TO service_role;

-- ── Verificación opcional ──────────────────────────────────────────────────
-- Después de crear la función, prueba que existe:
--   SELECT proname FROM pg_proc WHERE proname = 'cleanup_user_references';
-- Debe devolver 1 fila.
