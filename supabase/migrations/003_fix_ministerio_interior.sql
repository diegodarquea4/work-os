-- ==========================================================================
-- Fix: normalizar nombre del Ministerio del Interior
--
-- Hoy "Ministerio del Interior" y "Ministerio de Seguridad Pública" son
-- dos carteras separadas. Las iniciativas que quedaron como "Ministerio del
-- Interior y Seguridad Pública" (o variantes con "Min.") deben quedar como
-- "Ministerio del Interior" — Seguridad Pública es independiente.
--
-- Correr en orden:
--   1. Bloque DIAGNÓSTICO (SELECT) — revisar qué cambia.
--   2. Bloque UPDATE — aplicar el cambio.
--   3. Verificación final (SELECT) — confirmar 0 filas remanentes.
-- ==========================================================================

-- ── 1. DIAGNÓSTICO ─────────────────────────────────────────────────────────
-- Iniciativas afectadas. Ejecutar primero para revisar antes de actualizar.

SELECT
  n,
  region,
  ministerio,
  nombre
FROM prioridades_territoriales
WHERE ministerio ILIKE '%Interior y Seguridad Pública%'
ORDER BY region, n;

-- Resumen agregado por valor exacto del campo ministerio
SELECT
  ministerio,
  COUNT(*) AS n_iniciativas
FROM prioridades_territoriales
WHERE ministerio ILIKE '%Interior y Seguridad Pública%'
GROUP BY ministerio
ORDER BY n_iniciativas DESC;


-- ── 2. UPDATE ──────────────────────────────────────────────────────────────
-- Cubre las dos variantes ortográficas habituales:
--   - "Ministerio del Interior y Seguridad Pública"
--   - "Min. del Interior y Seguridad Pública"
-- También maneja el caso donde el ministerio aparece concatenado con otros
-- (ej: "Min. del Interior y Seguridad Pública · Carabineros") preservando lo
-- demás.

UPDATE prioridades_territoriales
SET ministerio = REPLACE(
                    REPLACE(ministerio,
                      'Ministerio del Interior y Seguridad Pública',
                      'Ministerio del Interior'),
                    'Min. del Interior y Seguridad Pública',
                    'Min. del Interior')
WHERE ministerio ILIKE '%Interior y Seguridad Pública%';


-- ── 3. VERIFICACIÓN ────────────────────────────────────────────────────────
-- Debe devolver 0 filas.

SELECT COUNT(*) AS remanentes
FROM prioridades_territoriales
WHERE ministerio ILIKE '%Interior y Seguridad Pública%';

-- Ver distribución final de ministerios que contienen "Interior" o "Seguridad"
SELECT
  ministerio,
  COUNT(*) AS n_iniciativas
FROM prioridades_territoriales
WHERE ministerio ILIKE '%Interior%' OR ministerio ILIKE '%Seguridad%'
GROUP BY ministerio
ORDER BY n_iniciativas DESC;
