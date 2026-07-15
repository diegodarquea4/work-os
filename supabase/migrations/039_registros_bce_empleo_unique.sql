-- 039_registros_bce_empleo_unique.sql
--
-- UNIQUE (serie_id, periodo) en registros_bce_empleo para que el upsert del sync
-- de empleo funcione (ON CONFLICT (serie_id, periodo)). La tabla se creó en la
-- mig 031 sin esta constraint; se aplicó manualmente en prod. Se agrega acá de
-- forma idempotente para dejar repo y BD consistentes (un rebuild desde
-- migraciones la incluye). Mismo patrón que 037 (constraints únicas de métricas).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.registros_bce_empleo'::regclass
      AND conname = 'registros_bce_empleo_serie_periodo_key'
  ) THEN
    ALTER TABLE public.registros_bce_empleo
      ADD CONSTRAINT registros_bce_empleo_serie_periodo_key UNIQUE (serie_id, periodo);
  END IF;
END $$;
