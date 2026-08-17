-- ============================================================================
-- 060_comite_infraestructura.sql
--
-- Comité de Infraestructura — quinta instancia del módulo Sesiones (junto a
-- 'eje'/Comité Policial, 'gabinete'/Gabinete Regional, 'inversion'/Comité
-- Económico y 'politico'/Comité Político, mig 059), mismo mecanismo "sin eje"
-- que Gabinete Regional (mig 046) y Comité Económico (mig 049/050):
-- instancia='infraestructura', eje_id NULL. Piloteado por región vía
-- region_config (mismo patrón que gabinete_habilitado), habilitado para las
-- 16 regiones desde el día uno (decisión de producto 2026-08-06).
--
-- Dos piezas propias de este comité:
--   · eje_sesiones.tipo_comite ('cri' | 'mesa_tecnica') — la sesión declara si
--     es un Comité Regional Interministerial de Infraestructura o una Mesa
--     Técnica Regional Interministerial. Sin CHECK de obligatoriedad por
--     instancia (mismo criterio laxo que `lugar`) — la app la inicializa en
--     'cri' al crear el borrador.
--   · region_config.infraestructura_tag — el tag de prioridades_territoriales
--     que alimenta la zona "Iniciativas contempladas" de la sesión (reemplaza
--     a "en foco" del gabinete): NO son las iniciativas en foco del gabinete,
--     son las iniciativas con este tag exacto (arranca en 'CRI', editable
--     por región sin deploy).
--
-- El envío de un compromiso de este comité al Gabinete Regional reusa el
-- mecanismo de escalamiento existente (escalado_a_gabinete, mig 046) — no es
-- una instancia nueva ni una tabla nueva, solo se expone en el formulario de
-- "Compromisos nuevos" como alternativa a "se gestiona en el siguiente
-- CRI/Mesa Técnica" en vez de requerir el toggle posterior a la creación.
--
-- 'politico' ya es instancia real (mig 059, Comité Político) al momento de
-- esta migración — el CHECK la incluye junto con 'infraestructura'.
-- ============================================================================

-- ── 1. eje_sesiones ──────────────────────────────────────────────────────────

ALTER TABLE public.eje_sesiones DROP CONSTRAINT IF EXISTS eje_sesiones_instancia_check;
ALTER TABLE public.eje_sesiones ADD CONSTRAINT eje_sesiones_instancia_check
  CHECK (instancia = ANY (ARRAY['eje', 'gabinete', 'inversion', 'infraestructura', 'politico']::text[]));

ALTER TABLE public.eje_sesiones DROP CONSTRAINT IF EXISTS eje_sesiones_instancia_eje_chk;
ALTER TABLE public.eje_sesiones ADD CONSTRAINT eje_sesiones_instancia_eje_chk
  CHECK (
    ((instancia = 'eje') AND (eje_id IS NOT NULL))
    OR ((instancia = ANY (ARRAY['gabinete', 'inversion', 'infraestructura', 'politico']::text[])) AND (eje_id IS NULL))
  );

ALTER TABLE public.eje_sesiones
  ADD COLUMN IF NOT EXISTS tipo_comite TEXT;
ALTER TABLE public.eje_sesiones DROP CONSTRAINT IF EXISTS eje_sesiones_tipo_comite_check;
ALTER TABLE public.eje_sesiones ADD CONSTRAINT eje_sesiones_tipo_comite_check
  CHECK (tipo_comite IS NULL OR tipo_comite = ANY (ARRAY['cri', 'mesa_tecnica']::text[]));

-- Un solo borrador vivo por (región, provincia) para Infraestructura — mismo
-- patrón que uq_eje_sesiones_un_borrador_gabinete / _inversion.
CREATE UNIQUE INDEX IF NOT EXISTS uq_eje_sesiones_un_borrador_infraestructura
  ON public.eje_sesiones (region_cod, COALESCE(provincia_cod, ''))
  WHERE estado = 'borrador' AND instancia = 'infraestructura';

-- idx_eje_sesiones_region_instancia_fecha (mig 046) ya cubre `instancia` en
-- general — sin índice nuevo.

-- ── 2. sesion_nomina ─────────────────────────────────────────────────────────

ALTER TABLE public.sesion_nomina DROP CONSTRAINT IF EXISTS sesion_nomina_instancia_check;
ALTER TABLE public.sesion_nomina ADD CONSTRAINT sesion_nomina_instancia_check
  CHECK (instancia = ANY (ARRAY['eje', 'gabinete', 'inversion', 'infraestructura', 'politico']::text[]));

ALTER TABLE public.sesion_nomina DROP CONSTRAINT IF EXISTS sesion_nomina_instancia_eje_chk;
ALTER TABLE public.sesion_nomina ADD CONSTRAINT sesion_nomina_instancia_eje_chk
  CHECK (
    ((instancia = 'eje') AND (eje_id IS NOT NULL))
    OR ((instancia = ANY (ARRAY['gabinete', 'inversion', 'infraestructura', 'politico']::text[])) AND (eje_id IS NULL))
  );

-- idx_sesion_nomina_region_instancia (mig 046) ya cubre `instancia` en general.

-- ── 3. sesion_compromisos ────────────────────────────────────────────────────

ALTER TABLE public.sesion_compromisos DROP CONSTRAINT IF EXISTS sesion_compromisos_instancia_check;
ALTER TABLE public.sesion_compromisos ADD CONSTRAINT sesion_compromisos_instancia_check
  CHECK (instancia = ANY (ARRAY['eje', 'gabinete', 'inversion', 'infraestructura', 'politico']::text[]));

ALTER TABLE public.sesion_compromisos DROP CONSTRAINT IF EXISTS sesion_compromisos_instancia_eje_chk;
ALTER TABLE public.sesion_compromisos ADD CONSTRAINT sesion_compromisos_instancia_eje_chk
  CHECK (
    ((instancia = 'eje') AND (eje_id IS NOT NULL))
    OR ((instancia = ANY (ARRAY['gabinete', 'inversion', 'infraestructura', 'politico']::text[])) AND (eje_id IS NULL))
  );

-- Zona 1 de Infraestructura: compromisos propios por región y estado — mismo
-- patrón que idx_sesion_compromisos_gabinete_abiertos / _inversion_abiertos.
CREATE INDEX IF NOT EXISTS idx_sesion_compromisos_infraestructura_abiertos
  ON public.sesion_compromisos (region_cod, estado)
  WHERE instancia = 'infraestructura';

-- idx_sesion_compromisos_escalados (mig 046) ya es genérico sobre
-- escalado_a_gabinete — cubre los compromisos de Infraestructura enviados al
-- Gabinete sin cambios.

-- ── 4. region_config — habilitación + nombre + tag ──────────────────────────

ALTER TABLE public.region_config
  ADD COLUMN IF NOT EXISTS infraestructura_habilitado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS infraestructura_nombre TEXT NOT NULL DEFAULT 'Comité de Infraestructura',
  ADD COLUMN IF NOT EXISTS infraestructura_tag TEXT NOT NULL DEFAULT 'CRI';

-- Habilitado para las 16 regiones desde el día uno (a diferencia del piloto
-- acotado del Gabinete) — decisión de producto 2026-08-06. UPSERT sin tocar
-- las columnas de gabinete de las regiones que ya tenían fila.
INSERT INTO public.region_config (region_cod, infraestructura_habilitado, infraestructura_nombre, infraestructura_tag) VALUES
  ('XV',   true, 'Comité de Infraestructura', 'CRI'),
  ('I',    true, 'Comité de Infraestructura', 'CRI'),
  ('II',   true, 'Comité de Infraestructura', 'CRI'),
  ('III',  true, 'Comité de Infraestructura', 'CRI'),
  ('IV',   true, 'Comité de Infraestructura', 'CRI'),
  ('V',    true, 'Comité de Infraestructura', 'CRI'),
  ('RM',   true, 'Comité de Infraestructura', 'CRI'),
  ('VI',   true, 'Comité de Infraestructura', 'CRI'),
  ('VII',  true, 'Comité de Infraestructura', 'CRI'),
  ('XVI',  true, 'Comité de Infraestructura', 'CRI'),
  ('VIII', true, 'Comité de Infraestructura', 'CRI'),
  ('IX',   true, 'Comité de Infraestructura', 'CRI'),
  ('XIV',  true, 'Comité de Infraestructura', 'CRI'),
  ('X',    true, 'Comité de Infraestructura', 'CRI'),
  ('XI',   true, 'Comité de Infraestructura', 'CRI'),
  ('XII',  true, 'Comité de Infraestructura', 'CRI')
ON CONFLICT (region_cod) DO UPDATE SET
  infraestructura_habilitado = EXCLUDED.infraestructura_habilitado,
  infraestructura_nombre     = EXCLUDED.infraestructura_nombre,
  infraestructura_tag        = EXCLUDED.infraestructura_tag;

-- RLS: region_config ya tiene SELECT any-auth + write staff/regional (mig
-- 046) a nivel de tabla — las columnas nuevas heredan esas policies sin
-- cambios. sesion_iniciativas (reusada tal cual para la zona "Iniciativas
-- contempladas") ya cubre instancia='infraestructura' porque sus policies
-- resuelven la región vía el padre eje_sesiones, no por instancia.
