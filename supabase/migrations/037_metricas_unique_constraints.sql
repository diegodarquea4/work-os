-- 037_metricas_unique_constraints.sql
-- (renumerada de 036 → 037: el 036 lo tomó 036_conflictos_regionales.sql en main)
-- Agrega restricciones UNIQUE faltantes en las tablas de métricas
-- importadas en 031_metricas_import.sql.
--
-- Sin esto, los upsert(on_conflict=...) del cron "Actualizar datos"
-- (dashboard-regional-chile/actualizar_datos.py) fallan en silencio con
-- "no unique or exclusion constraint matching the ON CONFLICT
-- specification" — el error se loguea pero no interrumpe el script,
-- así que nunca se notó. Verificado sin duplicados antes de aplicar
-- (399 / 10.752 / 41.495 filas, todas combinaciones únicas).

ALTER TABLE public.registros_leystop
  ADD CONSTRAINT registros_leystop_semana_region_key UNIQUE (id_semana, id_region);

ALTER TABLE public.registros_leystop_delitos
  ADD CONSTRAINT registros_leystop_delitos_semana_region_delito_key UNIQUE (id_semana, id_region, nombre_delito);

ALTER TABLE public.registros_bce
  ADD CONSTRAINT registros_bce_series_periodo_key UNIQUE (series_id, periodo);
