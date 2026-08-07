-- ============================================================================
-- 057_gabinete_temas_fijo.sql
--
-- Temas a tratar recurrentes: un tema puede "fijarse" (fijo=true) para que NO
-- se consuma al cerrar la sesión y siga disponible en la Preparación de la
-- próxima (vocerías, puntos permanentes). Los no fijados se archivan como
-- siempre (mig 053).
--
-- Al cerrar, el route /cerrar deja los fijados pendientes (sesion_id NULL) e
-- inserta una COPIA archivada a la sesión (sesion_id set, fijo=false) para que
-- el acta y el historial de esa sesión igual registren el tema tratado.
--
-- RLS: sin cambios. Las policies de la mig 053 gatean la escritura regional por
-- `sesion_id IS NULL AND region_cod = ANY(...)`, sin restringir columnas, así
-- que togglear `fijo` en un tema pendiente ya está cubierto.
-- ============================================================================

ALTER TABLE public.gabinete_temas
  ADD COLUMN IF NOT EXISTS fijo BOOLEAN NOT NULL DEFAULT false;
