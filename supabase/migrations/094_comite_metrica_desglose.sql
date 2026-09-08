-- ============================================================================
-- 094_comite_metrica_desglose.sql — Desglose predeterminado por métrica (2026-09-08)
--
-- Hoy el desglose de una métrica del Comité Policial (`sesion_comite_valor.
-- desglose`, JSONB) es texto libre que hay que retipear a mano cada semana.
-- Diego pidió poder predefinir esas etiquetas al crear/editar la métrica —
-- estandarizadas contra el catálogo de comunas/provincias de la región cuando
-- aplica, para no tener errores de tipeo, o texto libre cuando no.
--
-- `desglose_plantilla` tiene SIEMPRE la misma forma sin importar el tipo:
-- [{clave, etiqueta}] — comuna/provincia se resuelven UNA vez al guardar la
-- métrica (snapshot del catálogo de esa región en ese momento, no se
-- recalcula después); libre son las etiquetas que el usuario tipeó.
-- `desglose_tipo` es solo metadata de UI (qué editor mostrar al reeditar).
--
-- Sin cambios de RLS ni triggers: `comite_metrica` ya tiene policies por rol
-- que cubren cualquier columna (mig 048) y no tiene trigger de column-gate.
-- ============================================================================

BEGIN;

ALTER TABLE public.comite_metrica
  ADD COLUMN IF NOT EXISTS desglose_tipo TEXT NOT NULL DEFAULT 'ninguno',
  ADD COLUMN IF NOT EXISTS desglose_plantilla JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.comite_metrica
  DROP CONSTRAINT IF EXISTS comite_metrica_desglose_tipo_valido;
ALTER TABLE public.comite_metrica
  ADD CONSTRAINT comite_metrica_desglose_tipo_valido
  CHECK (desglose_tipo IN ('ninguno', 'comuna', 'provincia', 'libre'));

ALTER TABLE public.comite_metrica
  DROP CONSTRAINT IF EXISTS comite_metrica_desglose_plantilla_es_array;
ALTER TABLE public.comite_metrica
  ADD CONSTRAINT comite_metrica_desglose_plantilla_es_array
  CHECK (jsonb_typeof(desglose_plantilla) = 'array');

COMMENT ON COLUMN public.comite_metrica.desglose_tipo IS
  'Metadata de UI (mig 094): qué editor de plantilla mostrar. No se consulta al sembrar el desglose en una sesión — eso lee desglose_plantilla directo.';
COMMENT ON COLUMN public.comite_metrica.desglose_plantilla IS
  'Plantilla de desglose (mig 094): [{clave, etiqueta}]. Comuna/provincia = snapshot del catálogo de la región al guardar la métrica; libre = etiquetas tipeadas.';

COMMIT;
