-- ════════════════════════════════════════════════════════════════════════════
-- 083 — Reordenar ejes (número + nombre) con propagación a las iniciativas
--
-- Contexto (verificado 2026-08-26):
--   `region_ejes` es el catálogo per-región (id PK estable, numero 1..N único
--   por región, nombre puro). Las iniciativas y métricas referencian el eje por
--   FK `eje_id`, PERO ADEMÁS guardan un string denormalizado
--   `prioridades_territoriales.eje` / `metricas_eje.eje` = "Eje N: Nombre"
--   (dual-write histórico de la mig 015). Todo el panel —Kanban (agrupa por
--   `p.eje`), Dashboard, Bandeja, minuta y los PDF del acta— filtra / agrupa /
--   renderiza por ese STRING, no por el join a region_ejes (ver lib/db.ts
--   mapRow: `eje: row.eje`). Por eso, hoy, renombrar o renumerar un eje NO se
--   refleja en las iniciativas: quedan con el label viejo.
--
--   Además `RegionEjesPanel` sólo deja editar el NOMBRE y no reordenar: el
--   número está fijo desde la creación y la unicidad (region_cod, numero) impide
--   intercambiar dos números con dos UPDATE sueltos.
--
-- Qué hace esta migración (todo aditivo / sólo afloja — seguro para el
-- frontend viejo en prod):
--   1. Vuelve DEFERRABLE la unicidad (region_cod, numero) para poder renumerar
--      de forma atómica (permutación completa) sin colisiones transitorias.
--      INITIALLY IMMEDIATE ⇒ para inserts/edits normales se comporta idéntico;
--      sólo la RPC la difiere dentro de su transacción.
--   2. Trigger AFTER UPDATE en region_ejes que, al cambiar `numero` o `nombre`,
--      re-escribe el label denormalizado en TODAS las iniciativas (y métricas)
--      con ese `eje_id`. Un UPDATE set-based por tabla. Corre bajo la sesión
--      admin/editor que edita region_ejes (la única con RLS de escritura acá),
--      así que prioridades_check_update / metricas_eje_check_update lo dejan
--      pasar (rama admin/editor → RETURN NEW).
--   3. RPC `reordenar_region_ejes(region_cod, ids[])` que renumera 1..N según el
--      orden del array, en una sola transacción con la unicidad diferida.
--
-- Verificación previa (2026-08-26):
--   - Constraint a aflojar: region_ejes_region_cod_numero_key (UNIQUE, no
--     deferrable). CHECK region_ejes_numero_check (numero 1..99) se mantiene:
--     la RPC asigna siempre valores finales en rango (nunca "parkea").
--   - `prioridades_territoriales.eje` y `metricas_eje.eje` son NOT NULL text →
--     el UPDATE nunca los deja en NULL.
--   - Triggers existentes: sólo prioridades_check_update_trg y
--     metricas_eje_check_update_trg (BEFORE UPDATE); region_ejes no tenía
--     triggers. prioridades_territoriales no tiene updated_at → no se toca.
--   - Los labels hoy están alineados salvo drift puntual (ej. XIV eje 4): este
--     mismo trigger los realinea en la próxima edición del eje.
--
-- Aplicar en el SQL Editor de Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. Unicidad (region_cod, numero) → DEFERRABLE INITIALLY IMMEDIATE
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.region_ejes
  DROP CONSTRAINT IF EXISTS region_ejes_region_cod_numero_key;

ALTER TABLE public.region_ejes
  ADD CONSTRAINT region_ejes_region_cod_numero_key
  UNIQUE (region_cod, numero) DEFERRABLE INITIALLY IMMEDIATE;

-- ────────────────────────────────────────────────────────────────────────
-- 2. Propagación del label denormalizado a iniciativas + métricas
-- ────────────────────────────────────────────────────────────────────────
-- El formato "Eje N: Nombre" es el mismo que compone composeEjeLabel() en
-- lib/ejes.ts. Si ahí cambia el formato canónico, actualizar acá también.
CREATE OR REPLACE FUNCTION public.region_ejes_propagar_label()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.numero IS DISTINCT FROM OLD.numero
     OR NEW.nombre IS DISTINCT FROM OLD.nombre THEN

    UPDATE public.prioridades_territoriales
      SET eje = 'Eje ' || NEW.numero || ': ' || NEW.nombre
      WHERE eje_id = NEW.id
        AND eje IS DISTINCT FROM ('Eje ' || NEW.numero || ': ' || NEW.nombre);

    UPDATE public.metricas_eje
      SET eje = 'Eje ' || NEW.numero || ': ' || NEW.nombre
      WHERE eje_id = NEW.id
        AND eje IS DISTINCT FROM ('Eje ' || NEW.numero || ': ' || NEW.nombre);

  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.region_ejes_propagar_label() IS
  'AFTER UPDATE en region_ejes: al cambiar numero/nombre, re-escribe el label denormalizado "Eje N: Nombre" en prioridades_territoriales.eje y metricas_eje.eje de las filas con ese eje_id. Mantiene sincronizado el string que consume todo el panel (Kanban/Dashboard/Bandeja/minuta/PDF).';

DROP TRIGGER IF EXISTS region_ejes_propagar_label_trg ON public.region_ejes;

CREATE TRIGGER region_ejes_propagar_label_trg
AFTER UPDATE ON public.region_ejes
FOR EACH ROW
EXECUTE FUNCTION public.region_ejes_propagar_label();

-- ────────────────────────────────────────────────────────────────────────
-- 3. RPC de reordenamiento atómico
-- ────────────────────────────────────────────────────────────────────────
-- Recibe el orden deseado como array COMPLETO de ids de la región. Renumera
-- 1..N según la posición en el array. SET CONSTRAINTS DEFERRED permite las
-- colisiones transitorias de la permutación; la unicidad se valida al COMMIT.
-- SECURITY INVOKER (default) → la RLS de region_ejes (admin/editor) gatea las
-- escrituras. El trigger de propagación se dispara por fila con el numero final.
CREATE OR REPLACE FUNCTION public.reordenar_region_ejes(
  p_region_cod text,
  p_ids        bigint[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  i        int;
  n_region int;
  n_ids    int;
BEGIN
  -- El array debe cubrir TODOS los ejes de la región (permutación completa),
  -- si no dejaríamos filas con numero colgado / duplicado.
  SELECT COUNT(*) INTO n_region
  FROM public.region_ejes WHERE region_cod = p_region_cod;

  n_ids := COALESCE(array_length(p_ids, 1), 0);

  IF n_ids <> n_region THEN
    RAISE EXCEPTION 'reordenar_region_ejes: se esperaban % ids para la región % (llegaron %)',
      n_region, p_region_cod, n_ids
      USING ERRCODE = '22023';  -- invalid_parameter_value
  END IF;

  -- Diferir la unicidad hasta el COMMIT de esta transacción (la de la RPC).
  SET CONSTRAINTS public.region_ejes_region_cod_numero_key DEFERRED;

  FOR i IN 1 .. n_ids LOOP
    UPDATE public.region_ejes
      SET numero = i, updated_at = NOW()
      WHERE id = p_ids[i] AND region_cod = p_region_cod;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'reordenar_region_ejes: id % no pertenece a la región %',
        p_ids[i], p_region_cod
        USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.reordenar_region_ejes(text, bigint[]) IS
  'Renumera los ejes de una región a 1..N según el orden del array de ids (permutación completa). Atómico: unicidad (region_cod, numero) diferida al COMMIT. El trigger region_ejes_propagar_label re-escribe el label en las iniciativas afectadas.';

REVOKE ALL ON FUNCTION public.reordenar_region_ejes(text, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reordenar_region_ejes(text, bigint[]) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 4. RPC: reasignar el contenido de un eje a otro y borrar el eje origen
-- ────────────────────────────────────────────────────────────────────────
-- Borrar un eje con iniciativas/métricas está bloqueado por FK (ON DELETE NO
-- ACTION). Esta RPC mueve TODAS las iniciativas y métricas del eje origen al
-- destino (misma región) — reescribiendo también el label denormalizado — y
-- recién ahí elimina el origen, todo en una transacción.
--
-- El HISTORIAL DE COMITÉ (eje_sesiones, sesion_compromisos, sesion_nomina) NO
-- se reasigna: mover una sesión de Comité de un eje a otro deforma el historial
-- y choca con el CHECK (instancia, eje_id) de sesion_compromisos. Si el origen
-- tiene esas referencias, la función aborta con un mensaje claro. En la práctica
-- sólo el eje de Seguridad tiene comité, y ese no se borra.
--
-- SECURITY INVOKER → la RLS de region_ejes (DELETE admin/editor), de
-- prioridades_territoriales y de metricas_eje gatea las escrituras.
CREATE OR REPLACE FUNCTION public.reasignar_y_borrar_eje(
  p_origen  bigint,
  p_destino bigint
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_region      text;
  v_dest_region text;
  v_dest_numero int;
  v_dest_nombre text;
  v_label       text;
  v_comite      int;
BEGIN
  IF p_origen = p_destino THEN
    RAISE EXCEPTION 'El eje origen y el destino no pueden ser el mismo'
      USING ERRCODE = '22023';
  END IF;

  SELECT region_cod INTO v_region
  FROM public.region_ejes WHERE id = p_origen;
  IF v_region IS NULL THEN
    RAISE EXCEPTION 'El eje origen % no existe', p_origen USING ERRCODE = '22023';
  END IF;

  SELECT region_cod, numero, nombre
  INTO v_dest_region, v_dest_numero, v_dest_nombre
  FROM public.region_ejes WHERE id = p_destino;
  IF v_dest_region IS NULL THEN
    RAISE EXCEPTION 'El eje destino % no existe', p_destino USING ERRCODE = '22023';
  END IF;
  IF v_dest_region <> v_region THEN
    RAISE EXCEPTION 'Los ejes deben ser de la misma región (origen %, destino %)',
      v_region, v_dest_region USING ERRCODE = '22023';
  END IF;

  -- Historial de comité: no se reasigna, bloquea el borrado.
  SELECT
      (SELECT COUNT(*) FROM public.eje_sesiones      WHERE eje_id = p_origen)
    + (SELECT COUNT(*) FROM public.sesion_compromisos WHERE eje_id = p_origen)
    + (SELECT COUNT(*) FROM public.sesion_nomina      WHERE eje_id = p_origen)
  INTO v_comite;
  IF v_comite > 0 THEN
    RAISE EXCEPTION 'El eje tiene % referencias de Comité (sesiones/compromisos/nómina); el historial de comité no se reasigna, así que no se puede eliminar', v_comite
      USING ERRCODE = '23503';  -- foreign_key_violation (mismo código que el bloqueo real)
  END IF;

  v_label := 'Eje ' || v_dest_numero || ': ' || v_dest_nombre;

  UPDATE public.prioridades_territoriales
    SET eje_id = p_destino, eje = v_label
    WHERE eje_id = p_origen;

  UPDATE public.metricas_eje
    SET eje_id = p_destino, eje = v_label
    WHERE eje_id = p_origen;

  DELETE FROM public.region_ejes WHERE id = p_origen;
END;
$$;

COMMENT ON FUNCTION public.reasignar_y_borrar_eje(bigint, bigint) IS
  'Mueve todas las iniciativas y métricas del eje origen al destino (misma región, reescribiendo el label) y elimina el origen, en una transacción. Aborta si el origen tiene historial de Comité (eje_sesiones/sesion_compromisos/sesion_nomina).';

REVOKE ALL ON FUNCTION public.reasignar_y_borrar_eje(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reasignar_y_borrar_eje(bigint, bigint) TO authenticated, service_role;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN (correr manualmente después de aplicar)
--
-- 1) La unicidad quedó DEFERRABLE:
--    SELECT conname, condeferrable, condeferred
--    FROM pg_constraint WHERE conname = 'region_ejes_region_cod_numero_key';
--
-- 2) Trigger + funciones presentes:
--    SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.region_ejes'::regclass;
--    SELECT proname FROM pg_proc
--    WHERE proname IN ('region_ejes_propagar_label','reordenar_region_ejes');
--
-- 3) Prueba en seco de propagación por nombre (una región de prueba):
--    -- antes: contar labels desalineados
--    SELECT COUNT(*) FROM prioridades_territoriales p JOIN region_ejes re
--      ON p.eje_id = re.id
--    WHERE re.region_cod = 'XIV'
--      AND p.eje IS DISTINCT FROM ('Eje '||re.numero||': '||re.nombre);
--    -- editar un nombre (ej. corregir "Desarollo"→"Desarrollo" en XIV eje 4)
--    -- y volver a contar: debe quedar en 0 para ese eje.
--
-- 4) Reordenar (ejemplo XIV, invertir):
--    SELECT public.reordenar_region_ejes('XIV', ARRAY[9,25,24,26,15]::bigint[]);
--    SELECT numero, nombre FROM region_ejes WHERE region_cod='XIV' ORDER BY numero;
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- ROLLBACK (si algo se rompe)
-- ────────────────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP TRIGGER IF EXISTS region_ejes_propagar_label_trg ON public.region_ejes;
-- DROP FUNCTION IF EXISTS public.region_ejes_propagar_label();
-- DROP FUNCTION IF EXISTS public.reordenar_region_ejes(text, bigint[]);
-- DROP FUNCTION IF EXISTS public.reasignar_y_borrar_eje(bigint, bigint);
-- ALTER TABLE public.region_ejes DROP CONSTRAINT IF EXISTS region_ejes_region_cod_numero_key;
-- ALTER TABLE public.region_ejes ADD CONSTRAINT region_ejes_region_cod_numero_key
--   UNIQUE (region_cod, numero);
-- COMMIT;
