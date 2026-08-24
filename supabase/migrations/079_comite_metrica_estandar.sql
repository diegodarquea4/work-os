-- 079 — Catálogo NACIONAL de métricas estándar del Comité Policial + adopción
--        por región (formato check, como la nómina de asistencia).
--
-- Backlog 2026-08-21: hoy comite_metrica es per-región (cada una arma la suya).
-- Diego pidió un catálogo estándar definido UNA vez (admin, nacional) que cada
-- región ACTIVA con check las que le sirven ("no todas obligadas"), conviviendo
-- con las métricas propias de la región.
--
-- Diseño — adoptar = INSERT de una fila comite_metrica con estandar_id + origen
-- ('estandar'). Motivo: sesion_comite_valor.metrica_id → comite_metrica.id es la
-- espina de todos los consumidores (helpers, WoW, acta); una estándar adoptada
-- es una fila normal → NADA de la lógica de reporte/acta cambia. Desmarcar =
-- activo=false (conserva historial). Editar la estándar nacional NO retro-actualiza
-- las copias ya adoptadas (aceptado). Idempotente.

-- ── 1. Catálogo nacional (admin-only en escritura) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.comite_metrica_estandar (
  id               BIGSERIAL PRIMARY KEY,
  institucion      TEXT NOT NULL,   -- clave base (carabineros/pdi/armada/gendarmeria)
  nombre           TEXT NOT NULL,
  tipo             TEXT NOT NULL DEFAULT 'numerico' CHECK (tipo IN ('numerico','texto')),
  unidad           TEXT,
  orden            INT  NOT NULL DEFAULT 0,
  activo           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT,
  UNIQUE (institucion, nombre)
);

CREATE INDEX IF NOT EXISTS idx_comite_metrica_estandar_lookup
  ON public.comite_metrica_estandar (institucion, orden) WHERE activo;

ALTER TABLE public.comite_metrica_estandar ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier autenticado (para el modal de adopción por región).
DROP POLICY IF EXISTS comite_metrica_estandar_select_any ON public.comite_metrica_estandar;
CREATE POLICY comite_metrica_estandar_select_any ON public.comite_metrica_estandar
  FOR SELECT TO authenticated USING (true);

-- Escritura: SOLO admin (catálogo nacional, gate duro por rol).
DROP POLICY IF EXISTS comite_metrica_estandar_admin_all ON public.comite_metrica_estandar;
CREATE POLICY comite_metrica_estandar_admin_all ON public.comite_metrica_estandar
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ── 2. Vínculo de adopción en el catálogo por región ────────────────────────
ALTER TABLE public.comite_metrica
  ADD COLUMN IF NOT EXISTS estandar_id BIGINT REFERENCES public.comite_metrica_estandar(id),
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'propia' CHECK (origen IN ('estandar','propia'));

-- Una sola adopción de cada estándar por región (marca/desmarca idempotente).
CREATE UNIQUE INDEX IF NOT EXISTS uq_comite_metrica_estandar_region
  ON public.comite_metrica (region_cod, estandar_id) WHERE estandar_id IS NOT NULL;
