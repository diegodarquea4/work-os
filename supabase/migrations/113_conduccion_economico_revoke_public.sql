-- ============================================================================
-- 113_conduccion_economico_revoke_public.sql
--
-- Las dos funciones que trajo la mig 112 (`es_seremi_ajeno_al_economico`,
-- `conduce_economico`) quedaron con el EXECUTE que Postgres le da a PUBLIC por
-- defecto en toda función nueva. Son las ÚNICAS de su familia que lo tienen:
--
--   conduce_economico             =X/postgres | authenticated=X | service_role=X
--   es_seremi_ajeno_al_economico  =X/postgres | authenticated=X | service_role=X
--   current_user_can                           authenticated=X | service_role=X
--   can_operar_instancia                       authenticated=X | service_role=X
--
-- Ese `=X/postgres` de cabecera es PUBLIC, y PUBLIC incluye a `anon`, o sea que
-- vuelven a quedar expuestas como RPC en /rest/v1/rpc/* — justo lo que la mig
-- 088 cerró para todos los helpers SECURITY DEFINER (hallazgos 0028/0029 del
-- linter). El daño real hoy es chico: devuelven un booleano sobre el propio
-- llamante y sin sesión dan false. Pero la regla es que estas funciones no las
-- llama nadie desde afuera, y una excepción silenciosa en dos de ellas es cómo
-- se deshace un endurecimiento.
--
-- Recordatorio de la mig 088: `REVOKE ... FROM anon` NO alcanza — hay que
-- revocarle a PUBLIC, que es de donde anon lo hereda.
-- ============================================================================

REVOKE ALL ON FUNCTION public.es_seremi_ajeno_al_economico() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduce_economico(text)        FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.es_seremi_ajeno_al_economico() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduce_economico(text)        TO authenticated, service_role;
