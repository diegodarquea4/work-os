-- 045: drill-down comunal — comuna_cods (CUT oficiales) + alcance_regional
--
-- `comuna` (texto libre) NO se toca: sigue siendo lo que se muestra en la UI
-- y lo que cargan las regiones por Excel. `comuna_cods` es DERIVADO — lo
-- escribe el importador (matcher lib/comunas.ts) y el backfill one-shot desde
-- docs/drilldown-comunal/comuna_matching_full.csv. La llave es SIEMPRE el CUT
-- (código único territorial), nunca el nombre.
--
-- alcance_regional = true cuando el texto es "Regional/Varias/Todas/..." o el
-- campo viene vacío — esas iniciativas van a los buckets "Alcance regional" /
-- "Sin comuna" del nivel comunal del Mapa (no pueden desaparecer del drill).

ALTER TABLE prioridades_territoriales
  ADD COLUMN comuna_cods INT[] NOT NULL DEFAULT '{}',
  ADD COLUMN alcance_regional BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN prioridades_territoriales.comuna_cods IS
  'CUT oficiales derivados del texto `comuna` (matcher lib/comunas.ts). Multi-comuna = varios CUT, sin prorrateo.';
COMMENT ON COLUMN prioridades_territoriales.alcance_regional IS
  'true si `comuna` es "Regional/Varias/..." o viene vacía — bucket del nivel comunal del Mapa.';

-- Filtro del drill: comuna_cods @> ARRAY[cut]
CREATE INDEX idx_prioridades_comuna_cods
  ON prioridades_territoriales USING GIN (comuna_cods);

-- ── Trigger: columnas derivadas fuera del alcance del rol regional ──────────
-- prioridades_check_update() es BLOCKLIST allow-by-default para regional:
-- toda columna no enumerada es implícitamente editable. Igual que capa (027),
-- comuna_cods y alcance_regional deben enumerarse o un regional podría
-- alterarlas. Cuerpo base = versión vigente (028, con bypass service-role,
-- verificada contra prod vía pg_get_functiondef antes de esta migración).
CREATE OR REPLACE FUNCTION public.prioridades_check_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ur text;
BEGIN
  -- Service role (crons, importador, rutas API) no tiene auth.uid(): bypass.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

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
       NEW.comuna_cods       IS DISTINCT FROM OLD.comuna_cods       OR
       NEW.alcance_regional  IS DISTINCT FROM OLD.alcance_regional  OR
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
$function$;
