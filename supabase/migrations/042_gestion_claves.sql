-- 042_gestion_claves.sql
--
-- Gestión de claves y onboarding autoservicio (sin correo). Reemplaza la clave
-- compartida fija DCI2026 por: crear-con-código de un solo uso, activación donde el
-- usuario define su propia clave, cambio de clave propio, forzar-cambio y
-- recuperación por código (admin). Todo el copy/flujo vive en el código; esta
-- migración solo agrega el estado persistente. Aditiva e inerte hasta que el código
-- que la usa esté desplegado.

-- Flag de cambio obligatorio. Solo lo escribe service-role (rutas API): user_profiles
-- tiene RLS ON y sin policy de UPDATE, así que el usuario no puede apagarlo desde el
-- browser. Por eso NO se necesita un helper SECURITY DEFINER para blindarlo.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS debe_cambiar_clave boolean NOT NULL DEFAULT false;

-- Códigos de un solo uso (uno vigente por correo). Se guarda solo el hash SHA-256,
-- nunca el código en claro. La ruta de activación valida hash + vigencia + intentos.
CREATE TABLE IF NOT EXISTS public.codigos_acceso (
  email        text PRIMARY KEY,
  codigo_hash  text NOT NULL,
  expira       timestamptz NOT NULL,
  intentos     int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS habilitada y SIN políticas → la tabla es accesible únicamente por service_role
-- (que salta RLS). El browser nunca la toca.
ALTER TABLE public.codigos_acceso ENABLE ROW LEVEL SECURITY;
