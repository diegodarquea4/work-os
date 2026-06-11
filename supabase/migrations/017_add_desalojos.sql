-- ==========================================================================
-- Sección Desalojos — Mesa Interministerial de Desalojos
--
-- Contexto: la Mesa coordina ~15 casos (línea base) de operativos de desalojo
-- de tomas a nivel nacional. Cada caso es UNA iniciativa de
-- `prioridades_territoriales` que se etiqueta `es_desalojo = TRUE` y queda
-- bajo un seguimiento estructurado de 4 dimensiones transversales:
--
--   Jurídico        — instrumento habilitante (resolución, sentencia, 148 LGUC,
--                     querella 21.633, expropiación). Sin esto, Carabineros
--                     no levanta plan operativo.
--   Seguridad       — plan de intervención policial, contingente, plazos.
--   Social          — catastro (personas, NNA, AM, migrantes), albergues,
--                     subsidios, relocalización. Protocolo Ley 21.430 con NNA.
--   Financiamiento  — costo y fuente de la demolición. REGLA OPERATIVA DURA:
--                     sin financiamiento validado por DIPRES no se autoriza
--                     el desalojo (la demolición debe ser simultánea para
--                     impedir retoma).
--
-- Decisiones tomadas con Diego (ver plan de la sesión):
--   - El "caso" NO es un módulo paralelo: es UNA iniciativa de
--     `prioridades_territoriales` con un boolean diferenciador. Esto evita
--     duplicar nombre/región/comuna/semáforo/etc. en otra tabla.
--   - El toggle `es_desalojo` queda como columna en la tabla principal
--     (mismo patrón que `en_foco` migración 007). El seguimiento sensible
--     vive en tablas nuevas con RLS estricta (solo admin).
--   - Tabla `desalojo_seguimientos` aparte (no extender `seguimientos`):
--     `seguimientos` general es lectura pública para autenticados; los de
--     desalojos deben ser admin-only. Mezclarlas obligaría a una policy
--     compuesta lenta y frágil.
--   - Init eager de `desalojo_detalle`: cuando admin marca `es_desalojo = TRUE`
--     la API inserta la fila con defaults (semáforos en gris, campos null).
--     Siempre hay fila, código de lectura simple (sin upsert).
--   - `desalojo_log` clona el patrón de `semaforo_log`: audit de cada cambio
--     de semáforo o campo, incluido el toggle de `es_desalojo` mismo.
-- ==========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Columna diferenciadora en prioridades_territoriales
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE prioridades_territoriales
  ADD COLUMN IF NOT EXISTS es_desalojo BOOLEAN NOT NULL DEFAULT FALSE;

-- Índice parcial: la mayoría son FALSE. Solo indexamos los TRUE para
-- acelerar los filtros "Solo desalojos" en Dashboard / Bandeja y el
-- listado de la pestaña Desalojos. Calcado del idx de en_foco (007).
CREATE INDEX IF NOT EXISTS idx_prioridades_es_desalojo
  ON prioridades_territoriales(es_desalojo)
  WHERE es_desalojo = TRUE;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. desalojo_detalle — 1:1 con la iniciativa etiquetada
-- ─────────────────────────────────────────────────────────────────────────
-- Campos estructurados de las 4 dimensiones + semáforo por dimensión.
--
-- IMPORTANTE: el FK contra `prioridades_territoriales.n` NO se declara en SQL
-- porque `n` es identificador de negocio (no es la PRIMARY KEY de la tabla,
-- que es `id`). Esto es consistente con el resto del proyecto: `seguimientos`,
-- `documentos_prioridad` y `semaforo_log` tampoco declaran FK contra `n` —
-- solo lo usan como referencia lógica. El cleanup al borrar una iniciativa se
-- hace manualmente desde el endpoint DELETE /api/iniciativa/[n] (donde se
-- agrega DELETE de las 3 tablas de desalojo). Lo mismo aplica a las 2 tablas
-- de abajo.
--
-- Si se desetiqueta (es_desalojo → FALSE), la fila se CONSERVA — re-marcarla
-- vuelve a mostrar el seguimiento previo. Para borrar definitivamente,
-- admin entra a Supabase y hace DELETE manual (fuera de UI).

CREATE TABLE IF NOT EXISTS desalojo_detalle (
  prioridad_id              INT         PRIMARY KEY,

  -- Semáforos por dimensión (mismo vocabulario que el semáforo general)
  sem_juridico              TEXT        NOT NULL DEFAULT 'gris' CHECK (sem_juridico       IN ('verde','ambar','rojo','gris')),
  sem_seguridad             TEXT        NOT NULL DEFAULT 'gris' CHECK (sem_seguridad      IN ('verde','ambar','rojo','gris')),
  sem_social                TEXT        NOT NULL DEFAULT 'gris' CHECK (sem_social         IN ('verde','ambar','rojo','gris')),
  sem_financiamiento        TEXT        NOT NULL DEFAULT 'gris' CHECK (sem_financiamiento IN ('verde','ambar','rojo','gris')),

  -- Jurídico — texto libre hasta validar valores recurrentes (luego catálogo).
  instrumento               TEXT,
  fecha_instrumento         DATE,
  via_juridica              TEXT,
  notas_juridico            TEXT,

  -- Seguridad
  plan_operativo_listo      BOOLEAN     NOT NULL DEFAULT FALSE,
  contingente               TEXT,
  fecha_tentativa_operativo DATE,
  notas_seguridad           TEXT,

  -- Social — protocolo 21.430: con NNA no se fija fecha sin oferta validada.
  personas                  INTEGER,
  nna                       INTEGER,
  albergue_validado         BOOLEAN     NOT NULL DEFAULT FALSE,
  notas_social              TEXT,

  -- Financiamiento — la regla dura vive acá: financiamiento_asegurado = FALSE
  -- dispara banner persistente en la UI ("sin DIPRES no hay operativo").
  costo_demolicion_mm       NUMERIC,
  fuente                    TEXT,
  financiamiento_asegurado  BOOLEAN     NOT NULL DEFAULT FALSE,
  notas_financiamiento      TEXT,

  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. desalojo_seguimientos — timeline categorizada por dimensión
-- ─────────────────────────────────────────────────────────────────────────
-- Cada entrada pertenece a UNA dimensión (jurídico/seguridad/social/
-- financiamiento). El vocabulario de `tipo` espeja `seguimientos`
-- (avance/reunion/hito/alerta) para que el componente de timeline pueda
-- reusar mental model.

CREATE TABLE IF NOT EXISTS desalojo_seguimientos (
  id            BIGSERIAL   PRIMARY KEY,
  prioridad_id  INT         NOT NULL,    -- FK lógico a prioridades_territoriales.n (ver nota arriba)
  dimension     TEXT        NOT NULL CHECK (dimension IN ('juridico','seguridad','social','financiamiento')),
  tipo          TEXT        NOT NULL CHECK (tipo      IN ('avance','reunion','hito','alerta')),
  descripcion   TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_desalojo_seguimientos_lookup
  ON desalojo_seguimientos(prioridad_id, dimension, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. desalojo_log — audit log (clon de semaforo_log)
-- ─────────────────────────────────────────────────────────────────────────
-- Registra cada cambio: toggle de `es_desalojo`, semáforos, campos. El
-- `campo` es libre (string) porque cubre todos los atributos de
-- `desalojo_detalle` + `es_desalojo` mismo.

CREATE TABLE IF NOT EXISTS desalojo_log (
  id              BIGSERIAL   PRIMARY KEY,
  prioridad_id    INT         NOT NULL,    -- FK lógico a prioridades_territoriales.n (ver nota arriba)
  campo           TEXT        NOT NULL,
  valor_anterior  TEXT,
  valor_nuevo     TEXT        NOT NULL,
  cambiado_por    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_desalojo_log_lookup
  ON desalojo_log(prioridad_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RLS admin-only en las 3 tablas nuevas
-- ─────────────────────────────────────────────────────────────────────────
-- Patrón ya usado en 011_import_proposals (proposals_update_admin) y
-- 014_metricas_eje. Subquery a user_profiles + check role = 'admin'.
--
-- IMPORTANTE — sobre el toggle de `es_desalojo`:
-- La columna `es_desalojo` vive en `prioridades_territoriales`, cuya policy
-- de UPDATE es `authenticated_write` (cualquier autenticado). Esto significa
-- que las RLS de las 3 tablas nuevas protegen el SEGUIMIENTO, pero NO la
-- etiqueta misma. Para que solo admin pueda marcar/desmarcar, el toggle
-- DEBE pasar por la API route /api/desalojos/[n]/toggle con validación
-- server-side de role. Esconder el botón en UI no alcanza.

ALTER TABLE desalojo_detalle      ENABLE ROW LEVEL SECURITY;
ALTER TABLE desalojo_seguimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE desalojo_log          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "desalojo_detalle_admin_all"      ON desalojo_detalle;
DROP POLICY IF EXISTS "desalojo_seguimientos_admin_all" ON desalojo_seguimientos;
DROP POLICY IF EXISTS "desalojo_log_admin_all"          ON desalojo_log;

CREATE POLICY "desalojo_detalle_admin_all" ON desalojo_detalle
  FOR ALL
  USING       (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK  (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "desalojo_seguimientos_admin_all" ON desalojo_seguimientos
  FOR ALL
  USING       (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK  (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "desalojo_log_admin_all" ON desalojo_log
  FOR ALL
  USING       (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK  (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- ─────────────────────────────────────────────────────────────────────────
-- Verificación post-migración (correr en SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────
-- 1) La columna y el índice:
--    SELECT COUNT(*) FROM prioridades_territoriales WHERE es_desalojo = TRUE;
--    -- Debe ser 0 (nadie etiquetado aún).
--
-- 2) Las 3 tablas existen:
--    SELECT tablename FROM pg_tables
--    WHERE tablename IN ('desalojo_detalle','desalojo_seguimientos','desalojo_log');
--    -- Debe listar las 3.
--
-- 3) Las policies admin-only están creadas:
--    SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('desalojo_detalle','desalojo_seguimientos','desalojo_log');
--    -- Debe listar 3 filas, una policy FOR ALL por tabla.
