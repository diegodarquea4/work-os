-- ════════════════════════════════════════════════════════════════════════════
-- 090 — Códigos de respaldo de la verificación en dos pasos
--
-- Los factores TOTP viven en `auth.mfa_factors` (GoTrue), así que el 2FA en sí
-- no necesita tablas. Esto es lo que le faltaba al intento de agosto: una salida
-- para el usuario que pierde el teléfono.
--
-- Sin códigos de respaldo, la única recuperación era pedirle a un administrador
-- que borrara el factor. Eso deja a 56 personas dependiendo de que uno de los 6
-- admin esté disponible, y a los admin dependiendo entre ellos — con el riesgo
-- de que nadie pueda entrar si el último se queda sin su teléfono.
--
-- Se guarda solo el HASH del código (SHA-256, mismo criterio que
-- `codigos_acceso` de la mig 042). Un código usado no se borra: se marca con
-- `used_at`, para que quede el rastro de cuándo se ocupó cada uno.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mfa_backup_codes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Búsqueda del código al canjearlo: por usuario y sin usar.
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user
  ON public.mfa_backup_codes (user_id) WHERE used_at IS NULL;

-- Un mismo hash no puede repetirse para el mismo usuario.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mfa_backup_codes_user_hash
  ON public.mfa_backup_codes (user_id, code_hash);

-- RLS ON y SIN POLICIES: solo el service-role (las rutas API) toca esta tabla.
-- Mismo patrón que `codigos_acceso` (mig 042) y `user_capabilities` (mig 065).
-- El linter lo reporta como INFO 'rls_enabled_no_policy'; es intencional.
ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;

-- `anon` no tiene privilegios sobre public desde la mig 088, y el ALTER DEFAULT
-- PRIVILEGES de esa migración evita que esta tabla nazca abierta. Se revoca
-- también a `authenticated`: ni siquiera con sesión hay que poder leer los
-- hashes de los códigos de nadie.
REVOKE ALL ON public.mfa_backup_codes FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.mfa_backup_codes_id_seq FROM anon, authenticated;

COMMENT ON TABLE public.mfa_backup_codes IS
  'Códigos de respaldo del 2FA (hash SHA-256). Solo service-role. Un código se marca usado, no se borra.';

-- ── Verificación ────────────────────────────────────────────────────────────
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'mfa_backup_codes';  -- true
-- SELECT count(*) FROM pg_policies WHERE tablename = 'mfa_backup_codes';   -- 0
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_name = 'mfa_backup_codes';  -- solo postgres/service_role
