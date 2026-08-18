-- ============================================================================
-- 067_region_config_enforce_capabilities.sql — Fase 2 RLS, área region_config
--
-- Reescribe el trigger de columna region_config_check_update para gatear la
-- configuración del Comité de Infraestructura por CAPACIDAD en vez de por rol.
-- Antes (mig 064, interino): "si es regional, bloquea infra_habilitado/tag/
-- nombre". Ahora: "para cambiar esas columnas se requiere
-- current_user_can('comite.infraestructura.configurar', region)".
--
-- No-regresión: admin/editor tienen el cap 'all' (pasan igual); regional no lo
-- tiene (bloqueado igual). La diferencia: conceder configurar a un regional
-- desde el editor ahora SÍ lo habilita en su región. Instancia service-role
-- (auth.uid() null) pasa sin chequeo (crons/SSR).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.region_config_check_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.infraestructura_habilitado IS DISTINCT FROM OLD.infraestructura_habilitado OR
     NEW.infraestructura_tag        IS DISTINCT FROM OLD.infraestructura_tag        OR
     NEW.infraestructura_nombre     IS DISTINCT FROM OLD.infraestructura_nombre     THEN
    IF NOT public.current_user_can('comite.infraestructura.configurar', NEW.region_cod) THEN
      RAISE EXCEPTION 'se requiere la capacidad comite.infraestructura.configurar en % para modificar la config del comité en region_config', NEW.region_cod
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
