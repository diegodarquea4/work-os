-- ════════════════════════════════════════════════════════════════════════════
-- 088 — Cierra el acceso del rol `anon` al schema public (Tanda 1 de seguridad)
--
-- Contexto (auditoría 2026-09-04, verificado en producción con la anon key que
-- viaja en el bundle del navegador — o sea, cualquiera en Internet):
--
--   curl "$URL/rest/v1/semaforo_log?select=cambiado_por,campo,created_at" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--   → 200 con CORREOS de funcionarios y su historial de cambios.
--
-- Lo mismo con prego_monitoreo (16), v2_seguridad_semanal (881 filas de casos,
-- controles e incautaciones por región), v2_minutas_log (121, con
-- `generado_por`), metricas_eje, region_ejes, sync_status y toda la data de
-- syncs. Peor: `_backup_ministerio_086` quedó SIN RLS, así que anon podía
-- además BORRARLA (7.013 filas).
--
-- Causa raíz — NO son policies sueltas, es el GRANT de base:
--
--   prioridades_territoriales:  anon=arwdDxtm/postgres   ← ALL PRIVILEGES
--   semaforo_log:               anon=arwdDxtm/postgres
--   (y ALTER DEFAULT PRIVILEGES sigue dándoselo a cada tabla nueva)
--
-- Supabase concede por defecto todos los privilegios a `anon` sobre `public` y
-- deja que la RLS haga de único freno. Ese diseño funciona mientras TODA tabla
-- tenga RLS con una policy restrictiva — acá no se cumple: la mig 035 dejó
-- explícitamente ~30 tablas `USING (true)` («NOTA (acceso anon): estas tablas
-- siguen world-readable») y la mig 072 solo cerró 4 (prioridades, region_metrics,
-- seguimientos, documentos_prioridad).
--
-- En vez de reescribir ~30 policies una por una (mucho riesgo de romper
-- lecturas legítimas de usuarios con sesión), esta migración corta el problema
-- en la raíz: **`anon` deja de tener privilegios sobre `public`**. Las policies
-- `USING (true)` quedan intactas y pasan a significar lo que siempre se quiso
-- decir: «cualquier usuario AUTENTICADO».
--
-- Por qué es seguro (verificado en el código, no supuesto):
--   - El SSR (`app/page.tsx`) lee con `getSupabaseServerRead()` → cliente ligado
--     a la cookie de sesión → rol `authenticated` (Fase 3 de capas de usuarios).
--   - El login (`app/login/page.tsx`) solo llama a `/auth/v1` (GoTrue), que NO
--     pasa por PostgREST ni por estos grants.
--   - `/api/account/activate` (única ruta pública) usa service-role.
--   - `/admin/pipeline` y todo componente cliente corren con sesión.
--   - No hay suscripciones realtime en el repo.
--   → Ninguna ruta de datos del panel depende del rol anon.
--
-- ROLLBACK (si algo dejara de cargar):
--   GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
--
-- OJO: `manuel_metrics` (rol aparte para el import de métricas) NO se toca.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Respaldo de la mig 086: ya cumplió y era la única tabla sin RLS ───────
-- Copia sin scope de (id, ministerio) de las 7.013 iniciativas — justo el par
-- de columnas que la mig 087 protege. El SQL que la generó queda en git, así
-- que es reproducible; la canonización ya fue verificada (290 filas, MOP
-- 1696→1861). Es el único hallazgo nivel ERROR del linter de Supabase.
DROP TABLE IF EXISTS public._backup_ministerio_086;

-- ── 2. Quitar TODO privilegio de `anon` sobre el schema public ───────────────
REVOKE ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Y que las tablas FUTURAS tampoco nazcan abiertas (esto es lo que hace que el
-- agujero se vuelva a abrir solo con cada migración nueva).
-- Nota: ALTER DEFAULT PRIVILEGES solo afecta al rol que lo ejecuta. Las
-- migraciones corren como `postgres` y los objetos nuevos son suyos, así que
-- esta es la entrada que importa. Queda una entrada equivalente de
-- `supabase_admin` (objetos administrados por Supabase) que no es nuestra.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

-- ── 3. Higiene de funciones ─────────────────────────────────────────────────
-- 3.0 OJO (esto costó un segundo intento en prod): `REVOKE ... FROM anon` NO
-- quita un permiso concedido a PUBLIC — anon es miembro de PUBLIC y lo hereda
-- igual. Las funciones que las migs 072/087 crearon sin el REVOKE explícito que
-- sí hacen las migs 023/065/070 quedaron con la entrada `=X/postgres` (grantee
-- vacío = PUBLIC) y seguían llamables sin sesión por /rest/v1/rpc/*. Hay que
-- nombrar PUBLIC explícitamente.
REVOKE EXECUTE ON FUNCTION public.current_user_sees_region(text)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_ministerio()          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_sees_ministerio(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.norm_ministerio(text)              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.desalojo_planificacion_set_updated_at() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.desalojo_poligonos_set_updated_at()     FROM PUBLIC, authenticated;

-- 3a. Los helpers que las policies RLS invocan necesitan EXECUTE del rol
-- `authenticated` (la policy se evalúa como el invocador). El REVOKE de arriba
-- solo tocó a anon, pero lo re-afirmamos explícito para que quede legible qué
-- se espera de cada uno — y porque tres de ellos (mig 072 y 087) nunca hicieron
-- el REVOKE/GRANT explícito que sí hacen las migs 023/065/070.
GRANT EXECUTE ON FUNCTION public.current_user_role()                        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_can(text, text)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_sees_region(text)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_ministerio()                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_sees_ministerio(text)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_operar_sesion(bigint)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_operar_instancia(text, text)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.norm_ministerio(text)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reordenar_region_ejes(text, bigint[])      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reasignar_y_borrar_eje(bigint, bigint)     TO authenticated, service_role;

-- 3b. Las funciones de TRIGGER no necesitan EXECUTE de nadie: Postgres no
-- chequea el privilegio al dispararlas. Estaban expuestas como RPC en
-- /rest/v1/rpc/* (hallazgo 0028/0029 del linter). Se cierran para todos —
-- los triggers siguen funcionando igual.
REVOKE ALL ON FUNCTION public.prioridades_check_update()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.metricas_eje_check_update()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.region_config_check_update()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eje_sesiones_bloquea_cerrada()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sesion_hijas_bloquea_cerrada()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gabinete_tema_hijas_bloquea_cerrada() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.region_ejes_propagar_label()          FROM PUBLIC, anon, authenticated;

-- 3c. Refrescar la vista materializada es caro (lock + recálculo). Los 5
-- llamadores son syncs que usan service-role (`getSupabaseAdmin`), así que
-- ningún usuario con sesión necesita poder gatillarlo a voluntad.
REVOKE ALL ON FUNCTION public.refresh_v2_indicadores_ultimo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_v2_indicadores_ultimo() TO service_role;

-- 3d. `search_path` fijo en las que quedaban sin él (linter 0011). Sin esto, un
-- rol que pueda crear objetos en un schema del search_path del invocador podría
-- secuestrar a qué `lower()`/`translate()` resuelve la función.
ALTER FUNCTION public.norm_ministerio(txt text)                          SET search_path = public, pg_temp;
ALTER FUNCTION public.reordenar_region_ejes(p_region_cod text, p_ids bigint[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.reasignar_y_borrar_eje(p_origen bigint, p_destino bigint) SET search_path = public, pg_temp;
ALTER FUNCTION public.region_ejes_propagar_label()                       SET search_path = public, pg_temp;

-- ── 4. `seguimiento_compromisos`: faltaba el scope por ministerio ────────────
-- La mig 087 agregó `current_user_sees_ministerio` a prioridades, seguimientos,
-- documentos_prioridad y tareas, pero esta tabla (mig 081) quedó fuera: un
-- SEREMI veía los compromisos de iniciativas de OTROS ministerios de su región.
DROP POLICY IF EXISTS seguimiento_compromisos_read ON public.seguimiento_compromisos;
CREATE POLICY seguimiento_compromisos_read ON public.seguimiento_compromisos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.prioridades_territoriales p
      WHERE p.n = seguimiento_compromisos.prioridad_id
        AND public.current_user_sees_region(p.cod)
        AND public.current_user_sees_ministerio(p.ministerio)
    )
  );

-- ── Verificación ────────────────────────────────────────────────────────────
-- Debe devolver 0 filas:
--   SELECT table_name FROM information_schema.role_table_grants
--    WHERE grantee = 'anon' AND table_schema = 'public';
--
-- Y ninguna función debe conservar la entrada de PUBLIC (`=X/`):
--   SELECT proname, proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND array_to_string(proacl,',') LIKE '=X/%';
--
-- Desde fuera, con la anon key del bundle, todo debe dar 401:
--   curl -o /dev/null -w '%{http_code}' "$URL/rest/v1/semaforo_log?select=*&limit=1" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--
-- APLICADA A PROD el 2026-09-04 (en dos pasos: 088 + 088b por el detalle de
-- PUBLIC del punto 3.0). Verificado: 0 grants a anon, 11/11 tablas en 401,
-- 7/7 RPC en 401/404, y el linter sin hallazgos ERROR ni 0028.
--
-- Queda como aviso conocido y aceptado del linter: `v2_indicadores_ultimo`
-- (vista materializada legible por `authenticated` — la lee el hook
-- useV2Indicadores desde el navegador; anon nunca tuvo acceso porque las
-- matviews no reciben los grants por defecto) y los seis
-- `authenticated_security_definer_function_executable`, que son justamente los
-- helpers que las policies RLS necesitan poder invocar.
