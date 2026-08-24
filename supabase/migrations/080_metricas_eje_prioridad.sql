-- 080 — Vincular una métrica de eje a una iniciativa específica.
--
-- Backlog 2026-08-21: las métricas propias que la región agrega apretando sobre
-- un eje en Mi Región (metricas_eje) podrán apuntar, opcionalmente, a una
-- iniciativa (prioridades_territoriales). Vínculo por id estable (nunca n).
--
-- prioridad_id es campo de DEFINICIÓN → sólo metrica.definir puede cambiarlo.
-- Se re-crea el trigger de columna de mig 068 sumándolo a la lista prohibida
-- para reportar_valor. Aditivo-seguro: el frontend viejo nunca manda prioridad_id.
-- Idempotente.

ALTER TABLE public.metricas_eje
  ADD COLUMN IF NOT EXISTS prioridad_id BIGINT REFERENCES public.prioridades_territoriales(id);

CREATE INDEX IF NOT EXISTS idx_metricas_eje_prioridad
  ON public.metricas_eje (prioridad_id) WHERE prioridad_id IS NOT NULL;

-- ── Trigger de columna cap-aware (re-CREATE de mig 068 + prioridad_id) ──────
CREATE OR REPLACE FUNCTION public.metricas_eje_check_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Quien puede DEFINIR la métrica en su región edita cualquier columna.
  IF public.current_user_can('metrica.definir', OLD.region_cod) THEN
    RETURN NEW;
  END IF;

  -- Quien solo puede REPORTAR valor: únicamente valor_actual, y no si el valor
  -- se alimenta desde las sesiones.
  IF public.current_user_can('metrica.reportar_valor', OLD.region_cod) THEN
    IF NEW.titulo               IS DISTINCT FROM OLD.titulo               OR
       NEW.descripcion          IS DISTINCT FROM OLD.descripcion          OR
       NEW.objetivo             IS DISTINCT FROM OLD.objetivo             OR
       NEW.unidad               IS DISTINCT FROM OLD.unidad               OR
       NEW.region_cod           IS DISTINCT FROM OLD.region_cod           OR
       NEW.eje                  IS DISTINCT FROM OLD.eje                  OR
       NEW.eje_id               IS DISTINCT FROM OLD.eje_id               OR
       NEW.prioridad_id         IS DISTINCT FROM OLD.prioridad_id         OR
       NEW.tipo                 IS DISTINCT FROM OLD.tipo                 OR
       NEW.se_reporta_en_sesion IS DISTINCT FROM OLD.se_reporta_en_sesion OR
       NEW.created_at           IS DISTINCT FROM OLD.created_at           OR
       NEW.created_by_email     IS DISTINCT FROM OLD.created_by_email     OR
       NEW.id                   IS DISTINCT FROM OLD.id                   THEN
      RAISE EXCEPTION 'solo puede modificar valor_actual en metricas_eje (la definición la cambia quien tiene metrica.definir)'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.se_reporta_en_sesion AND NEW.valor_actual IS DISTINCT FROM OLD.valor_actual THEN
      RAISE EXCEPTION 'este valor se alimenta desde las sesiones (cierra una sesión para actualizarlo)'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'sin capacidad para modificar metricas_eje en %', OLD.region_cod
    USING ERRCODE = '42501';
END;
$function$;
