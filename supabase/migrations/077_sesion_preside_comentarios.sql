-- 077 — «Preside» fijado en la nómina + comentarios generales de la reunión.
--
-- Dos mejoras del backlog semanal (2026-08-21), ambas ADITIVAS y sin regresión:
--
--  F1. sesion_nomina.preside — marca a UNA persona de la nómina como quien
--      preside por defecto. El acta lo prefiere sobre el derivado por email
--      (closed_by_email ?? created_by_email). Índice parcial garantiza ≤1
--      preside activo por alcance (región + instancia [+ eje para 'eje']).
--      OJO: las sesiones cerradas ya tienen el PDF congelado (acta_path) →
--      el flag afecta SOLO previews y cierres futuros.
--
--  F2. eje_sesiones.comentarios — texto libre a nivel reunión (hoy solo hay
--      apuntes por institución y observaciones por métrica). Columna compartida
--      por todas las instancias; el trigger eje_sesiones_bloquea_cerrada ya
--      impide editarla tras el cierre.
--
-- Togglear preside es un UPDATE de sesion_nomina, ya cubierto por las policies
-- staff/regional de mig 044 → sin RLS nueva. Idempotente.

-- ── F1. Preside en la nómina ────────────────────────────────────────────────
ALTER TABLE public.sesion_nomina
  ADD COLUMN IF NOT EXISTS preside BOOLEAN NOT NULL DEFAULT false;

-- ≤1 preside activo por alcance. eje_id es nullable (mig 046): COALESCE lo
-- pliega para gabinete/inversión/político/infraestructura (instancia sin eje).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sesion_nomina_preside
  ON public.sesion_nomina (region_cod, instancia, COALESCE(eje_id, -1))
  WHERE preside AND activo;

-- ── F2. Comentarios generales de la reunión ─────────────────────────────────
ALTER TABLE public.eje_sesiones
  ADD COLUMN IF NOT EXISTS comentarios TEXT;
