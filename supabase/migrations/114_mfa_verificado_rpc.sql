-- 114 · Estado real del 2FA por usuario para Usuarios → Permisos.
--
-- Síntoma (Diego, 2026-09-16): la columna «2FA» decía "pendiente" para TODOS,
-- incluidos los 17 usuarios que ya tenían el autenticador configurado. La ruta
-- GET /api/admin/users deducía el estado de `user.factors` que devuelve
-- `auth.admin.listUsers()` — pero el endpoint de listado de GoTrue no puebla
-- `factors` (el tipo lo marca opcional), así que siempre venía vacío.
--
-- La fuente de verdad es `auth.mfa_factors` (status = 'verified'). PostgREST
-- no expone el esquema `auth`, así que se lee vía esta función SECURITY
-- DEFINER, ejecutable SOLO por service_role (la ruta ya corre con la admin
-- key). REVOKE FROM PUBLIC explícito: una función nueva nace ejecutable por
-- PUBLIC y quitarle a anon no basta (gotcha del plan de seguridad, mig 088).

create or replace function public.mfa_verificado_por_usuario()
returns table (user_id uuid, verificado boolean)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id as user_id,
         exists (
           select 1 from auth.mfa_factors f
           where f.user_id = p.id and f.status = 'verified'
         ) as verificado
  from public.user_profiles p
$$;

revoke all on function public.mfa_verificado_por_usuario() from public, anon, authenticated;
grant execute on function public.mfa_verificado_por_usuario() to service_role;

comment on function public.mfa_verificado_por_usuario() is
  'Estado del 2FA (algún factor verificado en auth.mfa_factors) por perfil. Solo service_role; la consume GET /api/admin/users.';
