-- ============================================================================
-- 076_gabinete_v2_recurrentes.sql — Gabinete v2 · PR-2 (retiro del pool `fijo`)
--
-- Parte ATÓMICA de PR-2: se aplica JUNTO con el reemplazo de TemasGabinetePanel
-- por el stepper de Preparación v2 y el ajuste del route de cierre. Antes de
-- este punto NO debe aplicarse (dejaría a las regiones piloto sin sus temas
-- recurrentes en la UI vigente). Idempotente.
--
-- Qué hace:
--   1. Semea gabinete_recurrentes (mig 074) desde los temas FIJOS del pool
--      (gabinete_temas con sesion_id IS NULL AND fijo = true). El `fijo`+copia-
--      al-cierre se jubila; los recurrentes son plantillas que el stepper
--      inserta como puntos borrador de cada sesión.
--   2. Borra esos temas fijos del pool (ahora viven como recurrentes).
--
-- Qué NO hace (a propósito):
--   - Los temas NO fijos del pool (sesion_id IS NULL AND fijo = false) se DEJAN:
--     el paso "Pendientes" del stepper los ofrece como legado a incluir en la
--     nueva pauta (no se pierde nada; el pool drena solo al usarse).
--   - `gabinete_temas.fijo` sigue como columna deprecada (074) — no se dropea
--     acá; queda dormida.
-- ============================================================================

-- 1. Semear recurrentes desde los fijos del pool (una sola vez, idempotente).
--    `titulo` <- texto del tema. `detalle` queda NULL (el recurrente es una
--    plantilla de título; el DPR completa el resto cada semana). No se arrastran
--    subitems (raros en fijos como "PSG"/"Agenda de visitas").
INSERT INTO public.gabinete_recurrentes (region_cod, titulo, detalle, orden, created_by_email)
SELECT gt.region_cod, gt.texto, NULL, gt.orden, gt.created_by_email
FROM public.gabinete_temas gt
WHERE gt.sesion_id IS NULL
  AND gt.fijo = true
  AND btrim(coalesce(gt.texto, '')) <> ''
  AND NOT EXISTS (   -- idempotencia: no duplicar si ya se sembró esta plantilla
    SELECT 1 FROM public.gabinete_recurrentes r
    WHERE r.region_cod = gt.region_cod
      AND r.titulo = gt.texto
  );

-- 2. Retirar los fijos del pool (ya migrados a recurrentes). Solo los fijos:
--    los no-fijos quedan para el triage de "Pendientes". Sin tema_id de
--    compromisos v2 apuntando a estas filas (son pre-v2), así que el
--    ON DELETE RESTRICT de sesion_compromisos.tema_id no se dispara.
DELETE FROM public.gabinete_temas
WHERE sesion_id IS NULL AND fijo = true;
