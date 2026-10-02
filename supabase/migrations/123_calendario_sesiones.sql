-- 123_calendario_sesiones.sql
--
-- Calendarización de las sesiones de los comités (Manuel, 2026-10-01): cada
-- delegación agenda hacia adelante y toda sesión nace en el calendario.
--
-- ── Estados ─────────────────────────────────────────────────────────────────
--
--   programada → borrador (abierta) → cerrada
--   programada → anulada  (solo antes de su fecha)
--
-- «No realizada» NO es un estado guardado: es una programada cuya fecha pasó
-- sin abrirse. Se deriva al leer (lib/sesiones/calendario.ts), así no hace
-- falta un cron que la marque.
--
-- ── Compatibilidad ──────────────────────────────────────────────────────────
--
-- Todo lo que hoy lee sesiones filtra por 'borrador' o 'cerrada' (actas,
-- cierre, métricas, tablero SEIA), así que una programada o anulada no se
-- confunde con nada. Los historiales, que leían sin filtro, se acotan en el
-- mismo PR.
--
-- ── Dos abiertas por comité ─────────────────────────────────────────────────
--
-- Antes había UNA (índices UNIQUE parciales por instancia, mig 044/046/050/
-- 059/060). Manuel pidió permitir dos y no más: un UNIQUE no cuenta hasta dos,
-- así que los índices se reemplazan por un trigger que cuenta bajo un lock
-- por comité. La llave del comité es la misma de los índices: región,
-- instancia, eje, provincia y —solo en el Económico— tipo_comite.
--
-- Idempotente: se puede correr más de una vez.

-- ── 1. Estados ──────────────────────────────────────────────────────────────

ALTER TABLE public.eje_sesiones DROP CONSTRAINT IF EXISTS eje_sesiones_estado_check;
ALTER TABLE public.eje_sesiones ADD CONSTRAINT eje_sesiones_estado_check
  CHECK (estado IN ('programada', 'borrador', 'cerrada', 'anulada'));

-- ── 2. Datos de agenda ──────────────────────────────────────────────────────

-- NULL = la sesión es anterior a la calendarización: cuenta como realizada,
-- pero no entra al cumplimiento.
ALTER TABLE public.eje_sesiones ADD COLUMN IF NOT EXISTS agenda TEXT;
ALTER TABLE public.eje_sesiones DROP CONSTRAINT IF EXISTS eje_sesiones_agenda_check;
ALTER TABLE public.eje_sesiones ADD CONSTRAINT eje_sesiones_agenda_check
  CHECK (agenda IS NULL OR agenda IN ('ordinaria', 'extraordinaria', 'registrada'));

COMMENT ON COLUMN public.eje_sesiones.agenda IS
  'ordinaria = agendada antes; extraordinaria = abierta el mismo día sin estar agendada; '
  'registrada = cargada después de hecha. NULL = anterior a la calendarización (mig 123). '
  'Solo las ordinarias entran al cumplimiento del calendario.';

ALTER TABLE public.eje_sesiones ADD COLUMN IF NOT EXISTS fecha_original DATE;
ALTER TABLE public.eje_sesiones ADD COLUMN IF NOT EXISTS motivo_cambio TEXT;
ALTER TABLE public.eje_sesiones ADD COLUMN IF NOT EXISTS serie_id UUID;

COMMENT ON COLUMN public.eje_sesiones.fecha_original IS
  'La primera fecha en que se agendó, si después se movió. NULL = nunca se movió.';
COMMENT ON COLUMN public.eje_sesiones.motivo_cambio IS
  'Por qué se movió o se anuló (obligatorio en la UI).';
COMMENT ON COLUMN public.eje_sesiones.serie_id IS
  'Las sesiones agendadas juntas como recurrentes comparten serie.';

-- ── 3. A lo más dos abiertas por comité ─────────────────────────────────────

DROP INDEX IF EXISTS public.uq_eje_sesiones_un_borrador;
DROP INDEX IF EXISTS public.uq_eje_sesiones_un_borrador_eje;
DROP INDEX IF EXISTS public.uq_eje_sesiones_un_borrador_gabinete;
DROP INDEX IF EXISTS public.uq_eje_sesiones_un_borrador_politico;
DROP INDEX IF EXISTS public.uq_eje_sesiones_un_borrador_infraestructura;
DROP INDEX IF EXISTS public.uq_eje_sesiones_un_borrador_inversion;

CREATE OR REPLACE FUNCTION public.eje_sesiones_reglas_agenda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  abiertas INT;
  hoy DATE := (now() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  -- Anular: solo una programada y solo antes de su fecha. Pasada la fecha ya es
  -- «no realizada»: anularla borraría un incumplimiento.
  IF NEW.estado = 'anulada' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'anulada') THEN
    IF TG_OP = 'INSERT' OR OLD.estado <> 'programada' THEN
      RAISE EXCEPTION 'Solo se anula una sesión programada.' USING ERRCODE = '23514';
    END IF;
    IF OLD.fecha < hoy THEN
      RAISE EXCEPTION 'La fecha de esta sesión ya pasó: no se puede anular.' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Una anulada no revive.
  IF TG_OP = 'UPDATE' AND OLD.estado = 'anulada' AND NEW.estado <> 'anulada' THEN
    RAISE EXCEPTION 'Una sesión anulada no se puede reabrir: agenda una nueva.' USING ERRCODE = '23514';
  END IF;

  -- Dos abiertas por comité, contando bajo un lock para que dos aperturas
  -- simultáneas no pasen las dos.
  IF NEW.estado = 'borrador' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'borrador') THEN
    PERFORM pg_advisory_xact_lock(hashtext(
      'eje_sesiones_abiertas|' || NEW.region_cod || '|' || NEW.instancia || '|' ||
      COALESCE(NEW.eje_id::text, '') || '|' || COALESCE(NEW.provincia_cod, '') || '|' ||
      CASE WHEN NEW.instancia = 'inversion' THEN COALESCE(NEW.tipo_comite, '') ELSE '' END));
    SELECT count(*) INTO abiertas
      FROM public.eje_sesiones s
     WHERE s.estado = 'borrador'
       AND s.id IS DISTINCT FROM NEW.id
       AND s.region_cod = NEW.region_cod
       AND s.instancia = NEW.instancia
       AND s.eje_id IS NOT DISTINCT FROM NEW.eje_id
       AND COALESCE(s.provincia_cod, '') = COALESCE(NEW.provincia_cod, '')
       AND (NEW.instancia <> 'inversion' OR COALESCE(s.tipo_comite, '') = COALESCE(NEW.tipo_comite, ''));
    IF abiertas >= 2 THEN
      RAISE EXCEPTION 'Este comité ya tiene dos sesiones abiertas: cierra una antes de abrir otra.'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS eje_sesiones_reglas_agenda_trg ON public.eje_sesiones;
CREATE TRIGGER eje_sesiones_reglas_agenda_trg
  BEFORE INSERT OR UPDATE ON public.eje_sesiones
  FOR EACH ROW EXECUTE FUNCTION public.eje_sesiones_reglas_agenda();

-- Para el calendario nacional (Métricas), que lee por fecha.
CREATE INDEX IF NOT EXISTS idx_eje_sesiones_fecha ON public.eje_sesiones (fecha);
