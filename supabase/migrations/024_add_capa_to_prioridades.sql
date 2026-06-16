-- ==========================================================================
-- Capa de importancia — clasificación con 3 niveles fijos
--
-- Complemento del toggle `en_foco`: mientras "En foco" es binario y volátil
-- (la región lo activa/desactiva en el ciclo), `capa` es un nivel de
-- importancia más permanente y granular, definido centralmente por DCI.
--
--   'l'   = las prioridades (top)
--   'll'  = más importante
--   'lll' = menos importante (DEFAULT — backfill de las iniciativas existentes)
--
-- Decisiones tomadas con Diego (2026-06-16):
--   - Default 'lll': todo lo cargado pre-hoy arranca acá. Es opt-in que
--     admin/editor mueva algo a 'll' o 'l'. El usuario lo dijo explícito.
--   - SOLO admin/editor edita. La columna queda FUERA de la whitelist
--     regional del trigger `prioridades_check_update()` (migración 023).
--     Eso es intencional — regional que intente UPDATE será rechazado con
--     SQLSTATE 42501. **NO TOCAR ese trigger.**
--   - TEXT + CHECK en vez de ENUM. Razón: convención del repo (semáforo,
--     prioridad, tipologías de desalojo). ENUMs en Postgres requieren
--     ALTER TYPE ADD VALUE no transaccional y rompen branch previews.
-- ==========================================================================

ALTER TABLE prioridades_territoriales
  ADD COLUMN capa TEXT NOT NULL DEFAULT 'lll'
  CHECK (capa IN ('l', 'll', 'lll'));

-- Índice parcial: la mayoría va a quedar en 'lll' por mucho tiempo. Solo
-- indexamos las "destacadas" para acelerar filtros del Dashboard, Bandeja
-- y el modo Kanban "Por capa". Mismo razonamiento que idx_prioridades_en_foco.
CREATE INDEX idx_prioridades_capa
  ON prioridades_territoriales(capa)
  WHERE capa <> 'lll';

COMMENT ON COLUMN prioridades_territoriales.capa IS
  'Nivel de importancia. l=prioridades, ll=más importante, lll=menos importante (default). Solo admin/editor edita — fuera de la whitelist regional del trigger prioridades_check_update.';

-- ── Verificación post-migración ─────────────────────────────────────────────
-- Debe devolver todas las filas en 'lll' inicialmente:
--   SELECT capa, COUNT(*) FROM prioridades_territoriales GROUP BY capa;
