-- ==========================================================================
-- Drop v2_iniciativas* (huérfanas desde migración 001)
--
-- Contexto (Auditoría 2026-06-17, decisión Diego):
-- El cutover a v2 nunca se completó. Solo el módulo de Indicadores migró;
-- iniciativas, minutas y RLS por rol siguen en v1. Las tablas v2_iniciativas
-- y sus satélites se crearon en la migración 001_v2_schema y nunca tuvieron
-- consumidores en TypeScript (verificado con grep).
--
-- v2 queda CONGELADO como "solo indicadores". v1 sigue canónico para
-- iniciativas, minutas y region_metrics. Mantener ambos modelos a medias
-- era la fuente principal de confusión.
--
-- Pre-flight ya ejecutado (pg_constraint):
--   - v2_iniciativas_seguimiento_iniciativa_id_fkey  → CASCADE OK
--   - v2_iniciativas_documentos_iniciativa_id_fkey   → CASCADE OK
--   - v2_iniciativas_semaforo_log_iniciativa_id_fkey → CASCADE OK
--
-- Conteos (snapshot 2026-06-17):
--   v2_iniciativas               = 1929 filas huérfanas (sin lectores)
--   v2_iniciativas_seguimiento   = 0
--   v2_iniciativas_documentos    = 0
--   v2_iniciativas_semaforo_log  = 0
-- ==========================================================================

DROP TABLE IF EXISTS v2_iniciativas_semaforo_log CASCADE;
DROP TABLE IF EXISTS v2_iniciativas_documentos CASCADE;
DROP TABLE IF EXISTS v2_iniciativas_seguimiento CASCADE;
DROP TABLE IF EXISTS v2_iniciativas CASCADE;
