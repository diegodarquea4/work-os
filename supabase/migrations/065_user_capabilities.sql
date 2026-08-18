-- ============================================================================
-- 065_user_capabilities.sql — Fase 0 del plan "Capas de usuarios" (fundaciones)
--
-- ADITIVO Y DORMIDO: crea la tabla de capacidades por (usuario, clave, región)
-- y la función `current_user_can()` — análoga a `current_user_role()` (mig 023).
-- NO toca ninguna RLS ni trigger existente: el enforcement duro llega en Fases
-- 2/3, cuando las policies pasen de `current_user_role() IN (...)` a
-- `current_user_can('<cap>', <región>)`. En Fase 0 nada consume esta función
-- todavía, así que una tabla vacía es inocua.
--
-- Fuente de verdad de la BD = esta tabla. El backfill espejo (una fila por cada
-- capacidad de cada usuario según su rol × regiones) se hace desde TS con
-- `capabilitiesForProfile()` (lib/permissions.ts) vía la ruta idempotente
-- POST /api/admin/capabilities/backfill — una sola fuente, sin duplicar los
-- presets en SQL. Correrlo antes de la Fase 2.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_capabilities (
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability_key text NOT NULL,
  region_cod     text NOT NULL DEFAULT '*',   -- '*' = todas las regiones
  granted_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, capability_key, region_cod)
);

-- Hot-path de la RLS futura: (user_id, capability_key, region_cod). El PK ya es
-- un btree compuesto que sirve el lookup; índice explícito redundante omitido.

-- RLS: como `codigos_acceso` (mig 042) — habilitada SIN policies = solo
-- service-role escribe/lee. El cliente nunca la toca directo: recibe sus
-- capacidades vía /api/me (service-role) y la BD las evalúa vía
-- current_user_can() (SECURITY DEFINER, se salta RLS).
ALTER TABLE public.user_capabilities ENABLE ROW LEVEL SECURITY;

-- ── current_user_can(cap, region) ───────────────────────────────────────────
-- Verdadero si el usuario autenticado tiene `cap` concedida para `region`
-- específica O para '*' (todas). Análoga a current_user_role(): SECURITY
-- DEFINER + STABLE para usarse en policies sin recursión.
CREATE OR REPLACE FUNCTION public.current_user_can(cap text, region text DEFAULT '*')
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_capabilities uc
    WHERE uc.user_id = auth.uid()
      AND uc.capability_key = cap
      AND (uc.region_cod = '*' OR uc.region_cod = region)
  )
$$;

COMMENT ON FUNCTION public.current_user_can(text, text) IS
  'Fase 0 capas de usuarios: true si el usuario autenticado tiene la capacidad `cap` en `region` (o en ''*''). Lee user_capabilities via SECURITY DEFINER. Reemplaza gradualmente a current_user_role() IN (...) en la RLS (Fases 2/3).';

REVOKE ALL ON FUNCTION public.current_user_can(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can(text, text) TO authenticated, service_role;
