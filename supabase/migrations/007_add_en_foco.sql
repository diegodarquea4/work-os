-- ==========================================================================
-- Bandera "en foco" — estilo flag de email
--
-- Permite que las delegaciones regionales marquen manualmente qué
-- iniciativas están en el foco del ciclo actual de seguimiento.
-- AttentionTray muestra estas iniciativas como sección principal,
-- desplazando las alertas automáticas (Hito vencido, Bloqueadas, etc.)
-- a un bloque secundario de "Sugerencias".
--
-- Decisiones tomadas con Diego:
--   - Campo global (no per-usuario): todos los miembros de la delegación
--     ven la misma lista de foco. Si más adelante se necesita foco
--     personal, se agrega tabla satélite — por ahora sería over-eng.
--   - Boolean simple sin fechas/ventanas: el usuario fue explícito en
--     que no quiere plazos. Se enciende y se apaga manualmente, sin
--     ceremonia. Cuando termina el ciclo, desmarcás lo resuelto y
--     marcás lo siguiente.
--   - Default FALSE: ninguna iniciativa arranca en foco. Es opt-in.
-- ==========================================================================

ALTER TABLE prioridades_territoriales
  ADD COLUMN en_foco BOOLEAN NOT NULL DEFAULT FALSE;

-- Índice parcial: la gran mayoría de filas tendrán en_foco=FALSE.
-- Solo indexamos las TRUE para acelerar el filtro de AttentionTray
-- sin gastar storage indexando millones de FALSE.
CREATE INDEX idx_prioridades_en_foco
  ON prioridades_territoriales(en_foco)
  WHERE en_foco = TRUE;

-- ── Verificación ──────────────────────────────────────────────────────────
-- Debe devolver 0 inicialmente (todas arrancan sin foco):
-- SELECT COUNT(*) FROM prioridades_territoriales WHERE en_foco = TRUE;
