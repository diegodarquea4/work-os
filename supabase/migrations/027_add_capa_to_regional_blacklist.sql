-- ==========================================================================
-- Incluir 'capa' en la blacklist del trigger regional de prioridades_territoriales.
--
-- Contexto:
--   mig 024 introdujo la columna `capa` (lll/ll/l). La decisión de producto
--   fue "solo admin/editor define capa". Sin embargo, el trigger
--   prioridades_check_update() de mig 023 fue creado antes de mig 024 y no
--   enumera `capa` en la lista de columnas bloqueadas para regional. Hoy un
--   regional puede modificar la `capa` de cualquier iniciativa de sus
--   regiones saltándose la decisión.
--
-- Fix:
--   Agregar `NEW.capa IS DISTINCT FROM OLD.capa` al bloque de la rama
--   regional. Mismo patrón que las 23 columnas ya enumeradas.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.prioridades_check_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ur text;
BEGIN
  ur := public.current_user_role();

  IF ur IN ('admin', 'editor') THEN
    RETURN NEW;
  END IF;

  IF ur = 'regional' THEN
    IF NEW.region            IS DISTINCT FROM OLD.region            OR
       NEW.cod               IS DISTINCT FROM OLD.cod               OR
       NEW.capital           IS DISTINCT FROM OLD.capital           OR
       NEW.zona              IS DISTINCT FROM OLD.zona              OR
       NEW.eje               IS DISTINCT FROM OLD.eje               OR
       NEW.eje_id            IS DISTINCT FROM OLD.eje_id            OR
       NEW.eje_gobierno      IS DISTINCT FROM OLD.eje_gobierno      OR
       NEW.nombre            IS DISTINCT FROM OLD.nombre            OR
       NEW.ministerio        IS DISTINCT FROM OLD.ministerio        OR
       NEW.prioridad         IS DISTINCT FROM OLD.prioridad         OR
       NEW.descripcion       IS DISTINCT FROM OLD.descripcion       OR
       NEW.codigo_iniciativa IS DISTINCT FROM OLD.codigo_iniciativa OR
       NEW.codigo_bip        IS DISTINCT FROM OLD.codigo_bip        OR
       NEW.inversion_mm      IS DISTINCT FROM OLD.inversion_mm      OR
       NEW.fuente_financiamiento IS DISTINCT FROM OLD.fuente_financiamiento OR
       NEW.tags              IS DISTINCT FROM OLD.tags              OR
       NEW.es_desalojo       IS DISTINCT FROM OLD.es_desalojo       OR
       NEW.comuna            IS DISTINCT FROM OLD.comuna            OR
       NEW.rat               IS DISTINCT FROM OLD.rat               OR
       NEW.origen            IS DISTINCT FROM OLD.origen            OR
       NEW.capa              IS DISTINCT FROM OLD.capa              OR
       NEW.n                 IS DISTINCT FROM OLD.n                 OR
       NEW.id                IS DISTINCT FROM OLD.id                THEN
      RAISE EXCEPTION 'regional solo puede modificar campos operativos en prioridades_territoriales (estado_semaforo, pct_avance, responsable, en_foco, etapa, próximo hito, fecha hito, estado término)'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'rol % no puede modificar prioridades_territoriales', COALESCE(ur, 'sin sesión')
    USING ERRCODE = '42501';
END;
$$;
