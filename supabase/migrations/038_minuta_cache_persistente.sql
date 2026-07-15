-- 038_minuta_cache_persistente.sql
--
-- Minuta persistente: una sola "versión vigente" por (region_cod, tipo),
-- persistente hasta que un admin la regenera. Antes la PK era
-- (region_cod, tipo, cache_date) y el flujo reusaba solo la fila de hoy (UTC),
-- por lo que la IA rehacía la minuta cada día. Ahora la versión queda guardada
-- y se previsualiza; solo un admin la regenera (sobrescribe la fila).

-- 1. Deduplicar: dejar solo la fila más reciente por (region_cod, tipo).
DELETE FROM public.minuta_cache m
WHERE EXISTS (
  SELECT 1 FROM public.minuta_cache m2
  WHERE m2.region_cod = m.region_cod AND m2.tipo = m.tipo
    AND (m2.cache_date, COALESCE(m2.generated_at, 'epoch'::timestamptz))
      >  (m.cache_date,  COALESCE(m.generated_at,  'epoch'::timestamptz))
);

-- 2. Nueva llave: una versión vigente por región+tipo.
ALTER TABLE public.minuta_cache DROP CONSTRAINT minuta_cache_pkey;
ALTER TABLE public.minuta_cache ADD  CONSTRAINT minuta_cache_pkey PRIMARY KEY (region_cod, tipo);

-- 3. Persistir el "Minuta DCI N°XX" de Contexto Regional (antes venía solo por
--    request y no se guardaba → el preview de la versión guardada lo perdía).
ALTER TABLE public.minuta_cache ADD COLUMN IF NOT EXISTS numero text;

-- cache_date se conserva (NOT NULL) como fecha de última generación informativa;
-- generated_at es la fecha autoritativa que muestra la UI.
