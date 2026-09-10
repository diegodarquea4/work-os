-- ============================================================================
-- 104_ubicacion_iniciativa.sql — Georreferenciación por iniciativa (2026-09-10)
--
-- Diego pidió ver un pin por iniciativa al hacer zoom en una región del Mapa
-- (drill comunal), con filtro por capa y clic → ficha. Hoy ninguna iniciativa
-- tiene coordenadas: solo `comuna_cods` (mig 045). Se agrega la coordenada
-- exacta como dos columnas NUMERIC nullable (mismo molde que
-- `desalojo_capas.lat/lng`, mig 022 — sin PostGIS: no hay consultas
-- espaciales, el filtro es en el cliente).
--
-- NULL en ambas = "aproximado": el mapa dibuja la iniciativa en el centroide
-- de su primera comuna, desparramada alrededor, con estilo punteado. Cuando se
-- fija la coordenada (ficha o import Excel) el pin pasa a exacto.
--
-- Constraints:
--   · pareo: o las dos o ninguna (evita medio punto).
--   · caja de Chile INCLUYENDO Rapa Nui (lng ≈ -109.4), Juan Fernández y el
--     Territorio Antártico (lat hasta -90, lng hasta -53): lat ∈ [-90, -17],
--     lng ∈ [-113, -53]. Rechaza en la BD misma el error más frecuente al
--     tipear: lat/lng invertidas ("-70.66, -33.45" queda fuera de la caja).
--     La validación con mensaje amable vive en lib/coordenadas.ts (mismos
--     límites: CHILE_BBOX).
--
-- Permisos: el trigger `prioridades_check_update()` es una BLOCKLIST — una
-- columna nueva NO enumerada la edita cualquiera que pase la policy de fila.
-- Se redefine (cuerpo íntegro de la mig 092, última versión viva) sumando las
-- dos columnas al branch OPERATIVO: los regionales (iniciativa.editar_operativo
-- acotado a su región) son quienes van a georreferenciar su cartera. SEREMI
-- (solo editar_avance) no puede.
-- ============================================================================

BEGIN;

ALTER TABLE public.prioridades_territoriales
  ADD COLUMN IF NOT EXISTS ubicacion_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS ubicacion_lng NUMERIC;

ALTER TABLE public.prioridades_territoriales
  DROP CONSTRAINT IF EXISTS prioridades_ubicacion_pareada;
ALTER TABLE public.prioridades_territoriales
  ADD CONSTRAINT prioridades_ubicacion_pareada
  CHECK ((ubicacion_lat IS NULL) = (ubicacion_lng IS NULL));

ALTER TABLE public.prioridades_territoriales
  DROP CONSTRAINT IF EXISTS prioridades_ubicacion_en_chile;
ALTER TABLE public.prioridades_territoriales
  ADD CONSTRAINT prioridades_ubicacion_en_chile
  CHECK (
    ubicacion_lat IS NULL OR (
      ubicacion_lat BETWEEN -90 AND -17 AND
      ubicacion_lng BETWEEN -113 AND -53
    )
  );

COMMENT ON COLUMN public.prioridades_territoriales.ubicacion_lat IS
  'Latitud WGS84 de la iniciativa (mig 104). NULL = sin georreferenciar: el Mapa la dibuja aproximada en el centroide de su primera comuna.';
COMMENT ON COLUMN public.prioridades_territoriales.ubicacion_lng IS
  'Longitud WGS84 de la iniciativa (mig 104). Va siempre junto a ubicacion_lat (CHECK pareado) y dentro de la caja de Chile incl. insular/antártico.';

-- ── Trigger por columna: cuerpo de la mig 092 + ubicación en el branch operativo ──

CREATE OR REPLACE FUNCTION public.prioridades_check_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_propaga_eje boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.current_user_can('iniciativa.editar_definicional', OLD.cod) THEN
    RETURN NEW;
  END IF;

  -- ¿Es la propagación del catálogo de ejes? Solo si quien escribe gestiona los
  -- ejes de ESTA región y el nuevo `eje` es exactamente el label canónico del
  -- `eje_id` que queda, dentro de la misma región. Cualquier otra escritura de
  -- `eje`/`eje_id` sigue exigiendo iniciativa.editar_definicional.
  IF (NEW.eje IS DISTINCT FROM OLD.eje OR NEW.eje_id IS DISTINCT FROM OLD.eje_id)
     AND NEW.eje_id IS NOT NULL
     AND public.current_user_can('region.gestionar_ejes', OLD.cod)
  THEN
    v_propaga_eje := NEW.eje = (
      SELECT 'Eje ' || re.numero || ': ' || re.nombre
      FROM public.region_ejes re
      WHERE re.id = NEW.eje_id AND re.region_cod = OLD.cod
    );
  END IF;

  IF NEW.capa IS DISTINCT FROM OLD.capa
     AND NOT public.current_user_can('iniciativa.editar_capa', OLD.cod) THEN
    RAISE EXCEPTION 'modificar la capa requiere iniciativa.editar_capa'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.region            IS DISTINCT FROM OLD.region            OR
     NEW.cod               IS DISTINCT FROM OLD.cod               OR
     NEW.capital           IS DISTINCT FROM OLD.capital           OR
     NEW.zona              IS DISTINCT FROM OLD.zona              OR
     (NOT v_propaga_eje AND (
       NEW.eje    IS DISTINCT FROM OLD.eje  OR
       NEW.eje_id IS DISTINCT FROM OLD.eje_id))                   OR
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
     NEW.n                 IS DISTINCT FROM OLD.n                 OR
     NEW.id                IS DISTINCT FROM OLD.id                THEN
    RAISE EXCEPTION 'modificar campos definicionales requiere iniciativa.editar_definicional'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.en_foco IS DISTINCT FROM OLD.en_foco
     AND NOT public.current_user_can('iniciativa.marcar_foco', OLD.cod) THEN
    RAISE EXCEPTION 'marcar/quitar foco requiere iniciativa.marcar_foco'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.estado_semaforo IS DISTINCT FROM OLD.estado_semaforo OR
      NEW.pct_avance      IS DISTINCT FROM OLD.pct_avance)
     AND NOT public.current_user_can('iniciativa.editar_operativo', OLD.cod)
     AND NOT public.current_user_can('iniciativa.editar_avance', OLD.cod) THEN
    RAISE EXCEPTION 'mover semaforo o porcentaje de avance requiere iniciativa.editar_avance en la region %', OLD.cod
      USING ERRCODE = '42501';
  END IF;

  -- Operativo: responsable/etapa/hito y, desde la mig 104, la ubicación
  -- (georreferenciar la cartera es trabajo de la región).
  IF (NEW.responsable             IS DISTINCT FROM OLD.responsable             OR
      NEW.etapa_actual            IS DISTINCT FROM OLD.etapa_actual            OR
      NEW.estado_termino_gobierno IS DISTINCT FROM OLD.estado_termino_gobierno OR
      NEW.proximo_hito            IS DISTINCT FROM OLD.proximo_hito            OR
      NEW.fecha_proximo_hito      IS DISTINCT FROM OLD.fecha_proximo_hito      OR
      NEW.ubicacion_lat           IS DISTINCT FROM OLD.ubicacion_lat           OR
      NEW.ubicacion_lng           IS DISTINCT FROM OLD.ubicacion_lng)
     AND NOT public.current_user_can('iniciativa.editar_operativo', OLD.cod) THEN
    RAISE EXCEPTION 'modificar campos operativos requiere iniciativa.editar_operativo en la region %', OLD.cod
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
