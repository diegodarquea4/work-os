-- ════════════════════════════════════════════════════════════════════════════
-- 089 — Privatiza los buckets `project-docs` y `plan-regional`
--
-- ⚠️  APLICAR **DESPUÉS** de desplegar el código que firma los links.
--     Los signed URLs funcionan igual con el bucket público, así que el orden
--     código → migración no deja ninguna ventana rota. Al revés sí: los links
--     públicos guardados en BD dejarían de resolver.
--
-- Contexto (auditoría 2026-09-04). Verificado desde Internet, sin sesión, con
-- la anon key del bundle:
--
--   curl -X POST "$URL/storage/v1/object/list/project-docs" \
--        -H "apikey: $ANON" -d '{"prefix":"","limit":5}'
--   → 200 [{"name":"1"},{"name":"10988"},{"name":"12338"}]   ← lista carpetas
--
-- Dos problemas encadenados en `project-docs`:
--   1. El bucket es `public = true` → cualquiera con la URL descarga.
--   2. La policy `project_docs_select_any` es `TO PUBLIC` (sin cláusula TO, que
--      en Postgres significa PUBLIC, e incluye `anon`) con predicado
--      `bucket_id = 'project-docs'` a secas → anon puede LISTAR el bucket
--      completo y descubrir los paths, sin adivinar nada.
-- Resultado: el scope por región y ministerio que las migs 072/087 imponen a
-- `documentos_prioridad` se saltaba yendo directo a Storage.
--
-- `plan-regional` es público con nombres 100 % predecibles (`<COD>.pdf`), o sea
-- los 13 Planes Regionales de Gobierno estaban a un GET de distancia.
--
-- Los otros cuatro buckets ya eran privados y no se tocan:
-- desalojos-docs, comite-docs, conflictos-regionales, import-proposals,
-- autoridades-fichas.
--
-- ROLLBACK: UPDATE storage.buckets SET public = true WHERE id IN (...);
--           + restaurar la policy con `TO public`.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. plan-regional: bucket privado + archivo_url pasa de URL a PATH ────────
UPDATE storage.buckets SET public = false WHERE id = 'plan-regional';

-- Las 13 filas guardan hoy la URL pública completa:
--   https://<ref>.supabase.co/storage/v1/object/public/plan-regional/XIV.pdf
-- El código nuevo espera solo el path (`XIV.pdf`) para firmarlo. Se recorta
-- todo lo anterior al nombre del archivo — idempotente: una fila que ya sea un
-- path queda igual.
UPDATE public.planes_regionales
   SET archivo_url = regexp_replace(archivo_url, '^.*/', '')
 WHERE archivo_url IS NOT NULL
   AND archivo_url LIKE 'http%';

-- ── 2. project-docs: bucket privado + policy solo para autenticados ──────────
UPDATE storage.buckets SET public = false WHERE id = 'project-docs';

-- La lectura pasa de PUBLIC (anon incluido) a `authenticated`. El resto de las
-- policies del bucket (insert/update/delete, mig 026) se mantienen: ya exigen
-- sesión o rol.
DROP POLICY IF EXISTS project_docs_select_any ON storage.objects;
CREATE POLICY project_docs_select_any ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'project-docs');

-- Nota sobre `documentos_prioridad`: está en 0 filas hoy, así que no hay
-- backfill de URL→path que hacer. El componente igual maneja las filas legacy
-- (`esUrlAbsoluta` en components/modal/DocumentosTab.tsx) por si alguna llegara
-- desde una pestaña abierta con el código viejo.

-- ── Verificación ────────────────────────────────────────────────────────────
-- SELECT id, public FROM storage.buckets ORDER BY id;         -- todos en false
-- SELECT region_cod, archivo_url FROM public.planes_regionales; -- '<COD>.pdf'
-- curl -X POST "$URL/storage/v1/object/list/project-docs" \
--      -H "apikey: $ANON" -d '{"prefix":"","limit":5}'          -- → []
