-- 091_rls_prioridades_por_statement.sql
--
-- SÍNTOMA (2026-09-04): entrar al panel tiraba «Algo salió mal» (React #441 =
-- error del render de Server Components). Debajo:
--   Error: DB error (iniciativas page N): canceling statement due to statement timeout
-- El rol `authenticated` tiene statement_timeout = 8s. El SSR carga las ~7.015
-- iniciativas en 8 páginas EN PARALELO (lib/db.ts:getAllIniciativas) + un count.
--
-- CAUSA: la policy SELECT de `prioridades_territoriales` era
--   current_user_sees_region(cod) AND current_user_sees_ministerio(ministerio)
-- Las dos reciben una COLUMNA, así que Postgres las evalúa UNA VEZ POR FILA. Y
-- las dos son SECURITY DEFINER con `SET search_path`, lo que además impide que
-- el planner las inline: son llamadas de función de verdad, cada una con su
-- consulta a `user_profiles`. Peor: `current_user_sees_ministerio` (agregada por
-- la mig 087 anteayer) llama a `current_user_ministerio()` — otra consulta — y a
-- `norm_ministerio` varias veces, POR FILA.
--
-- Medido antes de este arreglo: un seq scan de 7.015 filas tardaba **1.150 ms**
-- (29.318 buffers). Ocho de esos en paralelo sobre la misma instancia se pisan
-- entre sí y cruzan los 8s. Por eso fallaba de a ratos y no siempre.
--
-- ARREGLO: separar lo que depende del USUARIO (constante durante el statement)
-- de lo que depende de la FILA. Envuelto en `(SELECT f())`, sin correlación con
-- la fila, el planner lo convierte en un InitPlan y lo evalúa UNA sola vez por
-- statement. Lo que queda por fila es comparar un texto contra un array.
--
-- La semántica NO cambia — se comprobó fila por fila contra estos valores:
--   admin (region_cods={})                7015
--   regional VII                           424
--   seremi MOP región X                     53
--   autenticado SIN fila en user_profiles     0   ← sigue fail-closed
--
-- `current_user_sees_region` y `current_user_sees_ministerio` se dejan tal cual:
-- las usan otras policies (seguimientos, documentos_prioridad, region_metrics,
-- comité económico) sobre tablas de decenas de filas, donde el costo por fila da
-- lo mismo. Acá el problema es el volumen, no la función.

-- ── Helpers sin argumentos: una evaluación por statement ─────────────────────

-- true = el usuario ve TODAS las regiones (admin/editor, o sin regiones
-- asignadas = alcance nacional). Sin fila en user_profiles devuelve false, igual
-- que el EXISTS de current_user_sees_region.
CREATE OR REPLACE FUNCTION public.current_user_all_regions()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND ( up.role IN ('admin', 'editor')
            OR up.region_cods IS NULL
            OR cardinality(up.region_cods) = 0 )
  );
$$;

-- Las regiones del usuario. Sin perfil → '{}' (no calza con ningún `cod`).
CREATE OR REPLACE FUNCTION public.current_user_region_cods()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT coalesce(
    (SELECT up.region_cods FROM public.user_profiles up WHERE up.id = auth.uid()),
    '{}'::text[]
  );
$$;

-- El ministerio del usuario ya normalizado. '' = sin restricción por ministerio.
CREATE OR REPLACE FUNCTION public.current_user_ministerio_norm()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.norm_ministerio(
    (SELECT up.ministerio FROM public.user_profiles up WHERE up.id = auth.uid())
  );
$$;

-- OJO (mismo gotcha que la mig 088b): `REVOKE ... FROM anon` NO alcanza, porque
-- CREATE FUNCTION concede EXECUTE a PUBLIC y anon es miembro de PUBLIC.
REVOKE EXECUTE ON FUNCTION public.current_user_all_regions()       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_region_cods()       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_ministerio_norm()   FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_all_regions()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_region_cods()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_ministerio_norm() TO authenticated, service_role;

-- ── La policy ────────────────────────────────────────────────────────────────
-- Se conserva el nombre («Public read») y el alcance (TO PUBLIC, permissive):
-- desde la mig 088 `anon` no tiene GRANT sobre ninguna tabla de `public`, así
-- que en la práctica esto solo aplica a `authenticated`.

DROP POLICY IF EXISTS "Public read" ON public.prioridades_territoriales;

CREATE POLICY "Public read" ON public.prioridades_territoriales
FOR SELECT
USING (
  (
    (SELECT public.current_user_all_regions())
    -- El `::text[]` no es decorativo: sin él Postgres lee `ANY (subconsulta)` y
    -- compara text con text[]. Con el cast lo lee como `ANY (arreglo)`.
    OR cod = ANY ((SELECT public.current_user_region_cods())::text[])
  )
  AND (
    (SELECT public.current_user_ministerio_norm()) = ''
    OR EXISTS (
      SELECT 1
      FROM unnest(string_to_array(coalesce(ministerio, ''), ';')) AS parte
      WHERE public.norm_ministerio(parte) = (SELECT public.current_user_ministerio_norm())
    )
  )
);
