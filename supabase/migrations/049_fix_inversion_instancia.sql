-- ============================================================================
-- 049_fix_inversion_instancia.sql
--
-- Corrige 048: esa migración agregó una columna `comite` ('policial'|
-- 'inversion') a eje_sesiones/sesion_nomina/sesion_compromisos para permitir
-- sesiones sin eje. Pero ya existía en la BD (fuera de los archivos de
-- migración de este repo — trabajo previo para "Gabinete Regional") una
-- columna `instancia` ('eje'|'gabinete') con el MISMO propósito: permitir
-- sesiones sin eje, con su propio par de CHECK constraints e índices únicos
-- de borrador (uq_..._un_borrador_eje / _gabinete). Las dos columnas
-- chocaban entre sí (el insert de una sesión de Inversión dejaba `instancia`
-- en su default 'eje' con eje_id NULL, violando el check de esa columna).
--
-- En vez de mantener dos discriminadores redundantes, esta migración
-- consolida en `instancia` (la que ya tenía infraestructura real: índices
-- únicos de borrador por variante, e idx_..._region_instancia_fecha) y
-- elimina `comite` por completo.
-- ============================================================================

-- ── eje_sesiones ─────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_eje_sesiones_region_comite_fecha;

ALTER TABLE public.eje_sesiones DROP CONSTRAINT IF EXISTS eje_sesiones_comite_eje_ck;
ALTER TABLE public.eje_sesiones DROP CONSTRAINT IF EXISTS eje_sesiones_comite_check;
ALTER TABLE public.eje_sesiones DROP COLUMN IF EXISTS comite;

ALTER TABLE public.eje_sesiones DROP CONSTRAINT IF EXISTS eje_sesiones_instancia_check;
ALTER TABLE public.eje_sesiones ADD CONSTRAINT eje_sesiones_instancia_check
  CHECK (instancia = ANY (ARRAY['eje', 'gabinete', 'inversion']::text[]));

ALTER TABLE public.eje_sesiones DROP CONSTRAINT IF EXISTS eje_sesiones_instancia_eje_chk;
ALTER TABLE public.eje_sesiones ADD CONSTRAINT eje_sesiones_instancia_eje_chk
  CHECK (
    ((instancia = 'eje') AND (eje_id IS NOT NULL))
    OR ((instancia = ANY (ARRAY['gabinete', 'inversion']::text[])) AND (eje_id IS NULL))
  );

-- Un solo borrador vivo por (región, provincia) para Inversión — mismo patrón
-- que uq_eje_sesiones_un_borrador_eje / _gabinete (ya existentes, sin tocar).
CREATE UNIQUE INDEX IF NOT EXISTS uq_eje_sesiones_un_borrador_inversion
  ON public.eje_sesiones (region_cod, COALESCE(provincia_cod, ''))
  WHERE estado = 'borrador' AND instancia = 'inversion';

-- ── sesion_nomina ────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_sesion_nomina_region_comite;

ALTER TABLE public.sesion_nomina DROP CONSTRAINT IF EXISTS sesion_nomina_comite_eje_ck;
ALTER TABLE public.sesion_nomina DROP CONSTRAINT IF EXISTS sesion_nomina_comite_check;
ALTER TABLE public.sesion_nomina DROP COLUMN IF EXISTS comite;

ALTER TABLE public.sesion_nomina DROP CONSTRAINT IF EXISTS sesion_nomina_instancia_check;
ALTER TABLE public.sesion_nomina ADD CONSTRAINT sesion_nomina_instancia_check
  CHECK (instancia = ANY (ARRAY['eje', 'gabinete', 'inversion']::text[]));

ALTER TABLE public.sesion_nomina DROP CONSTRAINT IF EXISTS sesion_nomina_instancia_eje_chk;
ALTER TABLE public.sesion_nomina ADD CONSTRAINT sesion_nomina_instancia_eje_chk
  CHECK (
    ((instancia = 'eje') AND (eje_id IS NOT NULL))
    OR ((instancia = ANY (ARRAY['gabinete', 'inversion']::text[])) AND (eje_id IS NULL))
  );

-- ── sesion_compromisos ───────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_sesion_compromisos_region_comite;

ALTER TABLE public.sesion_compromisos DROP CONSTRAINT IF EXISTS sesion_compromisos_comite_eje_ck;
ALTER TABLE public.sesion_compromisos DROP CONSTRAINT IF EXISTS sesion_compromisos_comite_check;
ALTER TABLE public.sesion_compromisos DROP COLUMN IF EXISTS comite;

ALTER TABLE public.sesion_compromisos DROP CONSTRAINT IF EXISTS sesion_compromisos_instancia_check;
ALTER TABLE public.sesion_compromisos ADD CONSTRAINT sesion_compromisos_instancia_check
  CHECK (instancia = ANY (ARRAY['eje', 'gabinete', 'inversion']::text[]));

ALTER TABLE public.sesion_compromisos DROP CONSTRAINT IF EXISTS sesion_compromisos_instancia_eje_chk;
ALTER TABLE public.sesion_compromisos ADD CONSTRAINT sesion_compromisos_instancia_eje_chk
  CHECK (
    ((instancia = 'eje') AND (eje_id IS NOT NULL))
    OR ((instancia = ANY (ARRAY['gabinete', 'inversion']::text[])) AND (eje_id IS NULL))
  );

-- Mismo patrón que idx_sesion_compromisos_gabinete_abiertos (ya existente).
CREATE INDEX IF NOT EXISTS idx_sesion_compromisos_inversion_abiertos
  ON public.sesion_compromisos (region_cod, estado)
  WHERE instancia = 'inversion';
