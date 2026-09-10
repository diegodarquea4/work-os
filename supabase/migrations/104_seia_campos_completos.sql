-- ============================================================================
-- 104_seia_campos_completos.sql
--
-- El buscador del SEIA devuelve 25 campos por expediente y el sync guardaba
-- 10. Los que faltaban son justamente los que sirven para decidir si un
-- proyecto entra a la cartera del Comité Económico: en qué comuna está, quién
-- es el titular, si entró por DIA o EIA, si está suspendido, dónde queda.
--
-- Todo es aditivo y nullable: las filas ya cargadas quedan con NULL hasta el
-- próximo sync, que las completa por upsert sobre el mismo `id`.
--
-- Qué NO viene del SEIA, para que quede escrito y nadie lo busque acá: mano de
-- obra directa/indirecta y vida útil existen, pero dentro del EIA/DIA como
-- documento — no son campos consultables del buscador. Y el estado de
-- EJECUCIÓN (en construcción / operando) no existe en el SEIA en ninguna
-- forma: su vocabulario de estados termina en la calificación ambiental. Esa
-- pregunta se responde con datos de la SMA (SNIFA), no de acá.
-- ============================================================================

-- ── seia_projects: la copia fiel del expediente ─────────────────────────────

ALTER TABLE public.seia_projects
  -- Ubicación. `comuna_nombre` viene multi-valor separado por coma cuando el
  -- proyecto cruza comunas ("Iquique, Pozo Almonte") — se guarda tal cual.
  ADD COLUMN IF NOT EXISTS comuna_nombre TEXT,
  ADD COLUMN IF NOT EXISTS region_nombre TEXT,
  -- Vía de ingreso: 'DIA' o 'EIA'. Es el mejor proxy de tamaño/complejidad
  -- que entrega el buscador.
  ADD COLUMN IF NOT EXISTS via_ingreso TEXT,
  ADD COLUMN IF NOT EXISTS razon_ingreso TEXT,
  ADD COLUMN IF NOT EXISTS tipo_proyecto TEXT,
  -- 'Activo' / 'Suspendido'. Un expediente suspendido no está avanzando.
  ADD COLUMN IF NOT EXISTS suspendido TEXT,
  -- Días legales restantes del trámite (solo tiene sentido en evaluación).
  ADD COLUMN IF NOT EXISTS dias_legales INT,
  -- Ficha con el detalle (distinta de url_ficha, que apunta al expediente).
  ADD COLUMN IF NOT EXISTS url_detalle TEXT,
  -- Punto representativo en el mapa del SEA, cuando el proyecto está
  -- georreferenciado. NULL = sin georreferencia publicada.
  ADD COLUMN IF NOT EXISTS url_mapa TEXT;

-- ── v2_proyectos_inversion: la tabla que consume la app ─────────────────────
-- El dual-write descartaba incluso campos que seia_projects sí guardaba
-- (actividad_actual, fecha_plazo). Se agregan los que la cartera necesita
-- para proponer candidatos por comuna y por vía de ingreso.

ALTER TABLE public.v2_proyectos_inversion
  ADD COLUMN IF NOT EXISTS comuna_nombre TEXT,
  ADD COLUMN IF NOT EXISTS via_ingreso TEXT,
  ADD COLUMN IF NOT EXISTS suspendido TEXT,
  ADD COLUMN IF NOT EXISTS fecha_plazo DATE,
  ADD COLUMN IF NOT EXISTS actividad_actual TEXT,
  ADD COLUMN IF NOT EXISTS url_mapa TEXT;

-- Filtrar candidatos por región + estado es la consulta de la pantalla de
-- importación; hoy sería un seq scan sobre toda la tabla.
CREATE INDEX IF NOT EXISTS idx_seia_projects_region_estado
  ON public.seia_projects (region_id, estado);
