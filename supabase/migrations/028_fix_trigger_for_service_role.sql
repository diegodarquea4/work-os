-- ==========================================================================
-- Fix: prioridades_check_update() bloqueaba UPDATEs desde service-role.
--
-- Contexto:
--   El comentario inline del trigger de mig 023 decia "service_role salta
--   triggers — no llega aca". Eso es FALSO en Postgres: los triggers BEFORE
--   se disparan siempre, incluido para service_role. La consecuencia: cuando
--   /api/import (o /api/proposals/[id]/approve) corren con getSupabaseAdmin(),
--   auth.uid() es NULL → current_user_role() devuelve NULL → el trigger cae
--   al RAISE EXCEPTION final 'rol sin sesion no puede modificar
--   prioridades_territoriales'.
--
--   Verificado empiricamente 2026-06-19 con un UPDATE no-op via MCP:
--   ERROR 42501: rol sin sesion no puede modificar prioridades_territoriales.
--
--   Implicancias del bug latente (desde mig 023, ~junio 2026):
--   - UPDATE via /api/import (filas del Excel con # rellena) → fallaban.
--   - INSERT via /api/import → OK porque el trigger es BEFORE UPDATE, no INSERT.
--   - /api/proposals/[id]/approve aplicaba el patch via service-role → fallaba.
--   - UPDATEs desde el browser → OK porque auth.uid() esta y current_user_role()
--     devuelve el rol real.
--
-- Fix:
--   Distinguir "service-role legitimo" (auth.uid() IS NULL) de "usuario
--   autenticado sin perfil" (auth.uid() esta, current_user_role() es NULL):
--   - Si auth.uid() IS NULL → service-role / cron / API admin → RETURN NEW.
--     Las policies RLS por encima ya filtran quien puede llegar al trigger.
--   - Si auth.uid() esta pero current_user_role() es NULL → usuario sin
--     perfil → seguir cayendo al RAISE como antes.
--
-- Resto del trigger queda igual: admin/editor pasan, regional aplica
-- whitelist (incluida la columna `capa` que sumamos en mig 027).
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
  -- service_role / cron / API admin: auth.uid() es NULL. Las policies RLS
  -- ya filtraron quien puede llegar a este trigger.
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
