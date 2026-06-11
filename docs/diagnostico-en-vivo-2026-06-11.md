# Diagnóstico en vivo — Work OS

**Fecha:** 2026-06-11
**Etapa:** 0 de consolidación backend (rama `consolidacion/etapa-0-diagnostico`)
**Fuente:** Apéndice A de [docs/auditoria-tecnica-2026-06.md](auditoria-tecnica-2026-06.md) + extensiones específicas del plan en `~/.claude/plans/creo-que-es-importante-abstract-ocean.md`.

## Cómo correr este diagnóstico

1. Abrí Supabase Studio → SQL Editor.
2. Ejecutá cada bloque (A1 → A8) en orden. Son **todos de solo lectura**, no modifican nada.
3. Pegá el resultado tal cual debajo de cada query en el bloque "Resultado".
4. **Importante**: sin UUIDs reales, emails de usuario reales, ni IPs. Solo agregados, nombres de columnas, conteos. Si una query devuelve PII, recortala antes de pegar.
5. Cuando termines, avisame para empezar Etapa 1.

> Si una query falla (tabla inexistente, permiso), pegá el error tal cual en el bloque — ese también es un dato útil.

---

## A1 — Políticas RLS existentes (confirma brecha 5.1)

Busca tablas de escritura con `USING (true)` o `auth.uid() IS NOT NULL` o `auth.role() = 'authenticated'`.

```sql
SELECT
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;
```

### Resultado A1

```
| tablename                   | policyname                      | cmd    | qual                                                                                                                                                                                       | with_check                                                                                                                                                 |
| --------------------------- | ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| desalojo_capas              | desalojo_capas_admin_all        | ALL    | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'admin'::text))))                                                              | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'admin'::text))))                              |
| desalojo_detalle            | desalojo_detalle_admin_all      | ALL    | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'admin'::text))))                                                              | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'admin'::text))))                              |
| desalojo_documentos         | desalojo_documentos_admin_all   | ALL    | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'admin'::text))))                                                              | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'admin'::text))))                              |
| desalojo_fase_estado        | desalojo_fase_estado_admin_all  | ALL    | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'admin'::text))))                                                              | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'admin'::text))))                              |
| desalojo_log                | desalojo_log_admin_all          | ALL    | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'admin'::text))))                                                              | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'admin'::text))))                              |
| desalojo_seguimientos       | desalojo_seguimientos_admin_all | ALL    | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'admin'::text))))                                                              | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'admin'::text))))                              |
| documentos_prioridad        | documentos_delete               | DELETE | (auth.role() = 'authenticated'::text)                                                                                                                                                      | null                                                                                                                                                       |
| documentos_prioridad        | documentos_insert               | INSERT | null                                                                                                                                                                                       | (auth.role() = 'authenticated'::text)                                                                                                                      |
| documentos_prioridad        | documentos_read                 | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| documentos_prioridad        | documentos_update               | UPDATE | (auth.role() = 'authenticated'::text)                                                                                                                                                      | null                                                                                                                                                       |
| import_log                  | import_log_read_admin           | SELECT | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = ANY (ARRAY['admin'::text, 'editor'::text])))))                                 | null                                                                                                                                                       |
| import_proposals            | proposals_insert_self           | INSERT | null                                                                                                                                                                                       | (proposer_id = auth.uid())                                                                                                                                 |
| import_proposals            | proposals_read                  | SELECT | ((proposer_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = ANY (ARRAY['admin'::text, 'editor'::text])))))) | null                                                                                                                                                       |
| import_proposals            | proposals_update_admin          | UPDATE | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = 'admin'::text))))                                                              | null                                                                                                                                                       |
| metricas_eje                | metricas_delete                 | DELETE | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = ANY (ARRAY['admin'::text, 'editor'::text])))))                                 | null                                                                                                                                                       |
| metricas_eje                | metricas_insert                 | INSERT | null                                                                                                                                                                                       | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = ANY (ARRAY['admin'::text, 'editor'::text]))))) |
| metricas_eje                | metricas_read                   | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| metricas_eje                | metricas_update                 | UPDATE | (auth.role() = 'authenticated'::text)                                                                                                                                                      | null                                                                                                                                                       |
| minuta_cache                | read_authenticated              | SELECT | (auth.uid() IS NOT NULL)                                                                                                                                                                   | null                                                                                                                                                       |
| mop_projects                | Auth upsert                     | INSERT | null                                                                                                                                                                                       | true                                                                                                                                                       |
| mop_projects                | Public read                     | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| mop_projects                | read_authenticated              | SELECT | (auth.uid() IS NOT NULL)                                                                                                                                                                   | null                                                                                                                                                       |
| mop_projects                | Auth update                     | UPDATE | true                                                                                                                                                                                       | null                                                                                                                                                       |
| planes_regionales           | read_authenticated              | SELECT | (auth.uid() IS NOT NULL)                                                                                                                                                                   | null                                                                                                                                                       |
| prego_monitoreo             | write_authed                    | ALL    | (auth.role() = 'authenticated'::text)                                                                                                                                                      | null                                                                                                                                                       |
| prego_monitoreo             | read_authenticated              | SELECT | (auth.uid() IS NOT NULL)                                                                                                                                                                   | null                                                                                                                                                       |
| prego_monitoreo             | read_public                     | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| prioridades_territoriales   | Public read                     | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| prioridades_territoriales   | anon_read                       | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| prioridades_territoriales   | read_authenticated              | SELECT | (auth.uid() IS NOT NULL)                                                                                                                                                                   | null                                                                                                                                                       |
| prioridades_territoriales   | authenticated_write             | UPDATE | (auth.uid() IS NOT NULL)                                                                                                                                                                   | (auth.uid() IS NOT NULL)                                                                                                                                   |
| region_ejes                 | region_ejes_delete              | DELETE | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = ANY (ARRAY['admin'::text, 'editor'::text])))))                                 | null                                                                                                                                                       |
| region_ejes                 | region_ejes_insert              | INSERT | null                                                                                                                                                                                       | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = ANY (ARRAY['admin'::text, 'editor'::text]))))) |
| region_ejes                 | region_ejes_read                | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| region_ejes                 | region_ejes_update              | UPDATE | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = ANY (ARRAY['admin'::text, 'editor'::text])))))                                 | null                                                                                                                                                       |
| region_metrics              | Public read                     | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| region_metrics              | read_authenticated              | SELECT | (auth.uid() IS NOT NULL)                                                                                                                                                                   | null                                                                                                                                                       |
| regional_metrics            | Auth insert                     | INSERT | null                                                                                                                                                                                       | true                                                                                                                                                       |
| regional_metrics            | Public read                     | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| regional_metrics            | read_authenticated              | SELECT | (auth.uid() IS NOT NULL)                                                                                                                                                                   | null                                                                                                                                                       |
| regional_metrics            | Auth update                     | UPDATE | true                                                                                                                                                                                       | null                                                                                                                                                       |
| seguimientos                | seguimientos_delete             | DELETE | (auth.role() = 'authenticated'::text)                                                                                                                                                      | null                                                                                                                                                       |
| seguimientos                | seguimientos_insert             | INSERT | null                                                                                                                                                                                       | (auth.role() = 'authenticated'::text)                                                                                                                      |
| seguimientos                | seguimientos_read               | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| seguimientos                | seguimientos_update             | UPDATE | (auth.role() = 'authenticated'::text)                                                                                                                                                      | null                                                                                                                                                       |
| seia_projects               | Auth upsert                     | INSERT | null                                                                                                                                                                                       | true                                                                                                                                                       |
| seia_projects               | Public read                     | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| seia_projects               | read_authenticated              | SELECT | (auth.uid() IS NOT NULL)                                                                                                                                                                   | null                                                                                                                                                       |
| seia_projects               | Auth update                     | UPDATE | true                                                                                                                                                                                       | null                                                                                                                                                       |
| semaforo_log                | semaforo_log_insert             | INSERT | null                                                                                                                                                                                       | (auth.role() = 'authenticated'::text)                                                                                                                      |
| semaforo_log                | semaforo_log_read               | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| stop_stats                  | read_authenticated              | SELECT | (auth.uid() IS NOT NULL)                                                                                                                                                                   | null                                                                                                                                                       |
| sync_status                 | public_read_sync_status         | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| user_profiles               | read own profile                | SELECT | (auth.uid() = id)                                                                                                                                                                          | null                                                                                                                                                       |
| user_profiles               | users_read_own                  | SELECT | (id = auth.uid())                                                                                                                                                                          | null                                                                                                                                                       |
| v2_ejes_estrategicos        | v2_ejes_read                    | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_fuentes                  | v2_fuentes_read                 | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_indicadores_catalogo     | v2_catalogo_read                | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_indicadores_pipeline     | v2_pipeline_read                | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_indicadores_pipeline_log | v2_pipeline_log_read            | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_indicadores_valores      | v2_valores_read                 | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_iniciativas              | v2_iniciativas_read             | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_iniciativas_documentos   | v2_documentos_read              | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_iniciativas_seguimiento  | v2_seguimiento_read             | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_iniciativas_semaforo_log | v2_semaforo_log_read            | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_ministerios              | v2_ministerios_read             | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_minutas_log              | v2_minutas_log_read             | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_proyectos_inversion      | v2_proyectos_read               | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_regiones                 | v2_regiones_read                | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
| v2_seguridad_semanal        | v2_seguridad_read               | SELECT | true                                                                                                                                                                                       | null                                                                                                                                                       |
```

---

## A2 — Qué tablas tienen RLS habilitado

```sql
SELECT
  relname AS tabla,
  relrowsecurity AS rls_on,
  relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace
ORDER BY relrowsecurity DESC, relname;
```

### Resultado A2

```
| tabla                       | rls_on | rls_forced |
| --------------------------- | ------ | ---------- |
| autoridades_regionales      | true   | false      |
| desalojo_capas              | true   | false      |
| desalojo_detalle            | true   | false      |
| desalojo_documentos         | true   | false      |
| desalojo_fase_estado        | true   | false      |
| desalojo_log                | true   | false      |
| desalojo_seguimientos       | true   | false      |
| documentos_prioridad        | true   | false      |
| import_log                  | true   | false      |
| import_proposals            | true   | false      |
| metricas_eje                | true   | false      |
| minuta_cache                | true   | false      |
| mop_projects                | true   | false      |
| planes_regionales           | true   | false      |
| prego_monitoreo             | true   | false      |
| prioridades_territoriales   | true   | false      |
| region_ejes                 | true   | false      |
| region_metrics              | true   | false      |
| regional_metrics            | true   | false      |
| security_weekly             | true   | false      |
| seguimientos                | true   | false      |
| seia_projects               | true   | false      |
| semaforo_log                | true   | false      |
| stop_stats                  | true   | false      |
| sync_status                 | true   | false      |
| user_profiles               | true   | false      |
| v2_ejes_estrategicos        | true   | false      |
| v2_fuentes                  | true   | false      |
| v2_indicadores_catalogo     | true   | false      |
| v2_indicadores_pipeline     | true   | false      |
| v2_indicadores_pipeline_log | true   | false      |
| v2_indicadores_valores      | true   | false      |
| v2_iniciativas              | true   | false      |
| v2_iniciativas_documentos   | true   | false      |
| v2_iniciativas_seguimiento  | true   | false      |
| v2_iniciativas_semaforo_log | true   | false      |
| v2_ministerios              | true   | false      |
| v2_minutas_log              | true   | false      |
| v2_proyectos_inversion      | true   | false      |
| v2_regiones                 | true   | false      |
| v2_seguridad_semanal        | true   | false      |
```

---

## A3 — Tamaño aproximado de cada tabla

```sql
SELECT
  relname AS tabla,
  n_live_tup AS filas_aprox,
  pg_size_pretty(pg_total_relation_size(relid)) AS espacio
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC NULLS LAST;
```

### Resultado A3

```
| tabla                       | filas_aprox | espacio |
| --------------------------- | ----------- | ------- |
| v2_indicadores_valores      | 10004       | 4032 kB |
| regional_metrics            | 9053        | 4800 kB |
| prioridades_territoriales   | 3015        | 2488 kB |
| v2_proyectos_inversion      | 2498        | 1144 kB |
| v2_iniciativas              | 1929        | 896 kB  |
| seia_projects               | 1684        | 1064 kB |
| v2_indicadores_ultimo       | 1051        | 200 kB  |
| v2_seguridad_semanal        | 881         | 384 kB  |
| stop_stats                  | 881         | 336 kB  |
| mop_projects                | 833         | 512 kB  |
| desalojo_fase_estado        | 132         | 96 kB   |
| desalojo_log                | 87          | 80 kB   |
| v2_indicadores_catalogo     | 84          | 64 kB   |
| v2_indicadores_pipeline     | 84          | 64 kB   |
| schema_migrations           | 76          | 24 kB   |
| schema_migrations           | 74          | 24 kB   |
| security_weekly             | 64          | 80 kB   |
| migrations                  | 61          | 40 kB   |
| region_ejes                 | 57          | 64 kB   |
| semaforo_log                | 46          | 32 kB   |
| v2_indicadores_pipeline_log | 45          | 32 kB   |
| v2_ministerios              | 25          | 48 kB   |
| minuta_cache                | 24          | 248 kB  |
| desalojo_capas              | 22          | 64 kB   |
| desalojo_detalle            | 20          | 32 kB   |
| import_log                  | 18          | 64 kB   |
| v2_fuentes                  | 18          | 48 kB   |
| v2_minutas_log              | 18          | 32 kB   |
| v2_regiones                 | 17          | 48 kB   |
| prego_monitoreo             | 16          | 32 kB   |
| region_metrics              | 16          | 64 kB   |
| users                       | 13          | 160 kB  |
| identities                  | 13          | 80 kB   |
| objects                     | 12          | 96 kB   |
| user_profiles               | 12          | 32 kB   |
| planes_regionales           | 12          | 32 kB   |
| refresh_tokens              | 11          | 176 kB  |
| v2_ejes_estrategicos        | 6           | 48 kB   |
| sessions                    | 6           | 128 kB  |
| mfa_amr_claims              | 6           | 80 kB   |
| buckets                     | 4           | 48 kB   |
| import_proposals            | 3           | 64 kB   |
| oauth_authorizations        | 0           | 40 kB   |
| messages_2026_06_14         | 0           | 24 kB   |
| documentos_prioridad        | 0           | 16 kB   |
| oauth_clients               | 0           | 24 kB   |
| messages_2026_06_13         | 0           | 24 kB   |
| sso_providers               | 0           | 32 kB   |
| webauthn_credentials        | 0           | 32 kB   |
| webauthn_challenges         | 0           | 32 kB   |
| saml_relay_states           | 0           | 40 kB   |
| buckets_vectors             | 0           | 16 kB   |
| mfa_challenges              | 0           | 24 kB   |
| instances                   | 0           | 16 kB   |
| metricas_eje                | 0           | 64 kB   |
| one_time_tokens             | 0           | 112 kB  |
| oauth_client_states         | 0           | 24 kB   |
| s3_multipart_uploads        | 0           | 24 kB   |
| sso_domains                 | 0           | 32 kB   |
| desalojo_seguimientos       | 0           | 32 kB   |
| s3_multipart_uploads_parts  | 0           | 16 kB   |
| vector_indexes              | 0           | 24 kB   |
| audit_log_entries           | 0           | 24 kB   |
| v2_iniciativas_semaforo_log | 0           | 16 kB   |
| sync_status                 | 0           | 16 kB   |
| custom_oauth_providers      | 0           | 56 kB   |
| saml_providers              | 0           | 32 kB   |
| messages_2026_06_11         | 0           | 24 kB   |
| messages_2026_06_10         | 0           | 24 kB   |
| secrets                     | 0           | 24 kB   |
| v2_iniciativas_documentos   | 0           | 16 kB   |
| messages_2026_06_09         | 0           | 24 kB   |
| messages                    | 0           | 0 bytes |
| oauth_consents              | 0           | 48 kB   |
| v2_iniciativas_seguimiento  | 0           | 16 kB   |
| messages_2026_06_08         | 0           | 24 kB   |
| desalojo_documentos         | 0           | 32 kB   |
| autoridades_regionales      | 0           | 16 kB   |
| subscription                | 0           | 32 kB   |
| mfa_factors                 | 0           | 56 kB   |
| buckets_analytics           | 0           | 24 kB   |
| flow_state                  | 0           | 40 kB   |
| seguimientos                | 0           | 32 kB   |
| messages_2026_06_12         | 0           | 24 kB   |
```

---

## A4 — Conteos v1 vs v2 (paridad de proyectos)

```sql
SELECT 'seia_projects' AS t, count(*) FROM seia_projects
UNION ALL SELECT 'mop_projects',           count(*) FROM mop_projects
UNION ALL SELECT 'v2_proyectos_inversion', count(*) FROM v2_proyectos_inversion
UNION ALL SELECT 'prioridades_territoriales', count(*) FROM prioridades_territoriales
UNION ALL SELECT 'v2_iniciativas',         count(*) FROM v2_iniciativas;
```

### Resultado A4

```
| t                         | count |
| ------------------------- | ----- |
| seia_projects             | 1684  |
| mop_projects              | 829   |
| v2_proyectos_inversion    | 2494  |
| prioridades_territoriales | 3015  |
| v2_iniciativas            | 1929  |
```

---

## A6 — Estado de todos los syncs

```sql
SELECT
  name,
  last_run_at,
  age(now(), last_run_at) AS atraso,
  last_status,
  last_rows,
  last_error_count,
  last_duration_ms
FROM sync_status
ORDER BY last_run_at DESC NULLS LAST;
```

### Resultado A6

```
Success. No rows returned
```

---

## A7 — Esquema de `user_profiles`

Confirma columnas, tipos, PK y unicidad. La tabla no tiene `CREATE` en migraciones del repo.

```sql
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_profiles'
ORDER BY ordinal_position;
```

### Resultado A7

```
| column_name | data_type                | is_nullable | column_default |
| ----------- | ------------------------ | ----------- | -------------- |
| id          | uuid                     | NO          | null           |
| email       | text                     | NO          | null           |
| full_name   | text                     | YES         | null           |
| role        | text                     | NO          | 'viewer'::text |
| created_at  | timestamp with time zone | YES         | now()          |
| updated_at  | timestamp with time zone | YES         | now()          |
| region_cods | ARRAY                    | YES         | '{}'::text[]   |```

```sql
SELECT
  i.indexname,
  i.indexdef
FROM pg_indexes i
WHERE i.schemaname = 'public' AND i.tablename = 'user_profiles';
```

### Resultado A7-indices

```
| indexname          | indexdef                                                                        |
| ------------------ | ------------------------------------------------------------------------------- |
| user_profiles_pkey | CREATE UNIQUE INDEX user_profiles_pkey ON public.user_profiles USING btree (id) |
```

---

## A8 — Esquema de `prioridades_territoriales`

Confirma si `id` y `n` existen, cuál es PK, y si ambos son UNIQUE. Crítico para Etapa 5.

```sql
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'prioridades_territoriales'
ORDER BY ordinal_position;
```

### Resultado A8

```
| column_name             | data_type | is_nullable | column_default                                        |
| ----------------------- | --------- | ----------- | ----------------------------------------------------- |
| id                      | integer   | NO          | nextval('prioridades_territoriales_id_seq'::regclass) |
| n                       | integer   | NO          | null                                                  |
| region                  | text      | NO          | null                                                  |
| cod                     | text      | NO          | null                                                  |
| capital                 | text      | NO          | null                                                  |
| zona                    | text      | NO          | null                                                  |
| eje                     | text      | NO          | null                                                  |
| nombre                  | text      | NO          | null                                                  |
| ministerio              | text      | YES         | null                                                  |
| prioridad               | text      | NO          | null                                                  |
| estado_semaforo         | text      | YES         | 'gris'::text                                          |
| pct_avance              | integer   | YES         | 0                                                     |
| responsable             | text      | YES         | null                                                  |
| codigo_iniciativa       | text      | YES         | null                                                  |
| descripcion             | text      | YES         | null                                                  |
| etapa_actual            | text      | YES         | null                                                  |
| estado_termino_gobierno | text      | YES         | null                                                  |
| proximo_hito            | text      | YES         | null                                                  |
| fecha_proximo_hito      | date      | YES         | null                                                  |
| fuente_financiamiento   | text      | YES         | null                                                  |
| codigo_bip              | text      | YES         | null                                                  |
| inversion_mm            | numeric   | YES         | null                                                  |
| comuna                  | text      | YES         | null                                                  |
| rat                     | text      | YES         | null                                                  |
| eje_gobierno            | text      | YES         | null                                                  |
| origen                  | text      | YES         | null                                                  |
| en_foco                 | boolean   | NO          | false                                                 |
| eje_id                  | bigint    | YES         | null                                                  |
| tags                    | ARRAY     | NO          | '{}'::text[]                                          |
| es_desalojo             | boolean   | NO          | false                                                 |
```

```sql
SELECT
  i.indexname,
  i.indexdef,
  i.indexname = (SELECT c.conname FROM pg_constraint c
                 JOIN pg_class cl ON cl.oid = c.conrelid
                 WHERE cl.relname = 'prioridades_territoriales' AND c.contype = 'p') AS is_primary
FROM pg_indexes i
WHERE i.schemaname = 'public' AND i.tablename = 'prioridades_territoriales';
```

### Resultado A8-indices

```
| indexname                      | indexdef                                                                                                                          | is_primary |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| prioridades_territoriales_pkey | CREATE UNIQUE INDEX prioridades_territoriales_pkey ON public.prioridades_territoriales USING btree (id)                           | true       |
| idx_prioridades_cod            | CREATE INDEX idx_prioridades_cod ON public.prioridades_territoriales USING btree (cod)                                            | false      |
| idx_prioridades_es_desalojo    | CREATE INDEX idx_prioridades_es_desalojo ON public.prioridades_territoriales USING btree (es_desalojo) WHERE (es_desalojo = true) | false      |
| idx_prioridades_en_foco        | CREATE INDEX idx_prioridades_en_foco ON public.prioridades_territoriales USING btree (en_foco) WHERE (en_foco = true)             | false      |
| idx_prioridades_eje_id         | CREATE INDEX idx_prioridades_eje_id ON public.prioridades_territoriales USING btree (eje_id)                                      | false      |
| idx_prioridades_tags           | CREATE INDEX idx_prioridades_tags ON public.prioridades_territoriales USING gin (tags)                                            | false      |
```

---

## Notas / sorpresas (síntesis Etapa 0)

Lectura del diagnóstico contra lo asumido en el plan. Los ajustes derivados se aplican al inicio de cada etapa que toca.

### Confirmaciones (calza con el plan)

- **Brecha 5.1 confirmada**. `prioridades_territoriales.authenticated_write` UPDATE con `auth.uid() IS NOT NULL` — cualquier sesión puede mutar. Igual `seguimientos`, `documentos_prioridad`, `metricas_eje.metricas_update` con `auth.role() = 'authenticated'`.
- **`region_ejes`, `metricas_eje.metricas_insert/delete`, todas las `desalojo_*` y `import_*`**: ya tienen políticas por rol (`admin`/`editor`). Patrón a replicar. No tocar.
- **`prioridades_territoriales` tiene `id` como PK** (`integer NOT NULL DEFAULT nextval(...)`), confirmado por `prioridades_territoriales_pkey` UNIQUE BTREE sobre `(id)`. Etapa 5 viable.

### Sorpresas importantes (ajustes al plan)

1. **`n` NO es UNIQUE en `prioridades_territoriales`**. Solo `id` lo es. Indices presentes: `prioridades_territoriales_pkey(id)`, `idx_prioridades_cod(cod)`, `idx_prioridades_eje_id`, `idx_prioridades_en_foco`, `idx_prioridades_es_desalojo`, `idx_prioridades_tags(gin)`. **Implicación**: hoy `.eq('n', ...)` podría matchear múltiples filas si `n` se repite. Etapa 5 lo blinda al pasar a `.eq('id', prioridad.id)`. Hasta entonces, queda como riesgo silente. No bloqueante para Etapa 1.

2. **`prioridades_territoriales` tiene 3.015 filas** (A3, A4), pero CLAUDE.md dice "tracks 63 territorial priorities". **Hay que entender qué son las otras ~2.950 filas** antes de Etapa 2 — si son archivados/históricos/multi-año, la matriz UI puede estar incompleta (¿pueden ediciones tocar las archivadas?). **Pregunta abierta al usuario** antes de Etapa 2.

3. **`sync_status` está VACÍO** (0 filas, A6). Aunque `seia-sync` y `mop-sync` llaman a `recordSyncStatus`, no hay rastro. Tres hipótesis:
   - Los syncs nunca corrieron exitosamente en el ambiente donde se está consultando.
   - El `upsert` falla silenciosamente (probable si RLS afecta, pero usa service role que salta RLS — improbable).
   - El usuario consultó una BD diferente a la de producción.

   **Implicación para Etapa 3**: la primera tarea de E3 es entender por qué `sync_status` no tiene datos en este ambiente. Si nunca corrió, el plan de E3 sigue igual (sumar `recordSyncStatus` a los otros 11 syncs). Si es otro ambiente, hay que confirmar contra prod.

4. **Políticas SELECT duplicadas** en varias tablas (no bloqueante, deuda menor):
   - `prioridades_territoriales`: 3 SELECT (`Public read`, `anon_read`, `read_authenticated`) — todas equivalentes a `true` o `auth.uid() IS NOT NULL`.
   - `prego_monitoreo`: 2 SELECT (`read_authenticated`, `read_public`).
   - `mop_projects`, `seia_projects`, `regional_metrics`: 2 SELECT cada una (`Public read` + `read_authenticated`).
   - `user_profiles`: 2 SELECT con misma condición (`read own profile` y `users_read_own`).

   Documentar al cerrar Etapa 2 como "deuda de limpieza", no aplicar.

5. **`user_profiles` sin policies write y RLS habilitado** → solo service role puede mutar. Es el patrón correcto. La función `current_user_role()` SECURITY DEFINER de Etapa 2 podrá leerla sin problema porque corre como dueño de la función (postgres), no como `auth.uid()`. Verificado que ya existen funciones SECURITY DEFINER en la base (`cleanup_user_references`, `refresh_v2_indicadores_ultimo`), o sea no es un patrón nuevo.

6. **Tablas mutadas vía service-role sin policies write**: `mop_projects`, `seia_projects`, `regional_metrics` tienen `Auth upsert/update USING (true)` — cualquier autenticado puede mutar via consola. NO es superficie de cliente hoy (UI no escribe), pero es brecha latente. **Etapa 2 debe incluir restricción a service-role-only para estas tablas** (cambiar `USING (true)` a `USING (false)` o quitar la policy). Lo dejo como item extra de Etapa 2.

7. **Tabla nueva no documentada**: `autoridades_regionales` aparece en A2 con RLS habilitado pero sin policies en A1 → solo service role la mutuó. Tabla nueva poblada quizá manualmente o via API admin. No bloqueante. Documentar.

8. **Tablas extra en A3** con counts útiles para contexto:
   - `regional_metrics`: 9.053 filas (BCCh series temporales). Confirma volumen alto.
   - `v2_indicadores_valores`: 10.004 filas. Confirma que v2 long format está poblado.
   - `v2_proyectos_inversion`: 2.494 filas; `seia_projects` + `mop_projects` = 2.513. Paridad razonable pero no exacta (19 fila de diferencia, normal para un dual-write).
   - `v2_iniciativas`: 1.929. **Menor que `prioridades_territoriales` (3.015)**. Si fuera espejo, debería ser igual. Indica que la "migración" v1→v2 nunca terminó (esperado, está fuera de alcance).
   - `documentos_prioridad`, `seguimientos`, `metricas_eje`, `desalojo_seguimientos`, `sync_status`: TODOS en 0. Posiblemente ambiente fresco o de staging.

9. **Funciones SECURITY DEFINER existentes**: `cleanup_user_references(uuid)`, `refresh_v2_indicadores_ultimo()`. Patrón establecido. La función `current_user_role()` que crearemos en Etapa 2 sigue exactamente el mismo molde.

10. **Materialized view**: `v2_indicadores_ultimo` ya existe (DISTINCT ON sobre `v2_indicadores_valores`). 1.051 filas. Refrescada por `refresh_v2_indicadores_ultimo()`. No tocar.

### Preguntas abiertas al usuario antes de Etapa 1

1. **¿Las ~3.000 filas adicionales en `prioridades_territoriales`** son archivados / históricos / multi-año / pruebas? ¿Hay alguna columna implícita (semáforo `gris` + sin avance, por ejemplo) que separe "activas (63)" de "el resto"? Esto afecta cómo la Etapa 2 (RLS por rol) debe interpretar "lo que el usuario puede editar desde la UI".
2. **¿`sync_status` está vacío porque nunca corrió en este ambiente, o porque la consulta corrió contra dev/staging y no prod?** Si es ambiente diferente, ¿el plan de E3 debe consultar prod para detectar atrasos reales, o asumir greenfield desde su despliegue?

Pendiente respuesta antes de cerrar Etapa 1.
