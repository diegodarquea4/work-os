-- ==========================================================================
-- Desalojos v2 — capas por polígono, tipología, fases con bloqueo, documentos
--
-- Contexto: la metodología real de la Mesa Interministerial de Desalojos no
-- es solo 4 dimensiones (lo que modela v1, migración 017). Cada caso puede
-- tener N polígonos con propietario, tipología, instrumento y ritmo distintos
-- (ej. La Chimba: 2 polígonos, BBNN ejecutado y Armada bloqueado por
-- DIRECTEMAR). Modelarlo como UNA fila aplana esa diferencia y obliga a
-- mentir en los semáforos.
--
-- v2 introduce:
--   - desalojo_capas: una fila por polígono. Lleva tipología (A/B/C/D),
--     fase actual (habilitacion → f1_policial → ... → cerrado), los 4
--     semáforos, los campos por dimensión (movidos desde desalojo_detalle),
--     campos físicos del polígono, y el checklist Paso 0 como JSONB.
--   - desalojo_documentos: documentos del caso (capa_id NULL) o por capa
--     (capa_id NOT NULL), opcionalmente por dimensión.
--   - capa_id en desalojo_seguimientos y desalojo_log (FK lógico).
--
-- desalojo_detalle queda como CONTEXTO del caso (resumen_narrativo + las
-- columnas migradas a capas se DROPEAN). La identificación (nombre, región,
-- comuna) ya vive en prioridades_territoriales.
--
-- Migración de datos: cada fila actual de desalojo_detalle genera UNA capa 1
-- con nombre 'Polígono único' copiando todos los campos. Los seguimientos y
-- log existentes se reasignan a esa capa 1. Cero pérdida.
--
-- FKs siguen siendo lógicos (no SQL FK contra prioridades_territoriales.n
-- porque `n` no es PK — consistente con migración 017 y el resto del proyecto).
-- Cleanup al borrar iniciativa se hace en /api/iniciativa/[n] DELETE handler.
--
-- Bucket Storage `desalojos-docs` se crea desde Supabase dashboard manualmente
-- (privado, RLS admin-only). Paths: {prioridad_id}/{capa_id|general}/{ts}_{file}.
-- ==========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. desalojo_capas — unidad de gestión (polígono)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS desalojo_capas (
  id                        BIGSERIAL   PRIMARY KEY,
  prioridad_id              INT         NOT NULL,    -- FK lógico a prioridades_territoriales.n
  nombre                    TEXT        NOT NULL,
  orden                     INT         NOT NULL DEFAULT 0,
  activa                    BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Tipología (A/B/C/D según matriz propiedad × estado procesal).
  -- NULL hasta que admin la asigne manualmente desde la sección.
  -- tipologia_asignada_at se usa para el banner Tipo D >30 días.
  tipologia                 TEXT        CHECK (tipologia IN ('A','B','C','D')),
  tipologia_nota            TEXT,
  tipologia_asignada_at     TIMESTAMPTZ,

  -- Fase (eje de progreso, secuencial). Bloqueo duro habilitacion → f1_policial:
  -- requiere los 4 semáforos en verde. Se enforce en el PATCH handler.
  fase_actual               TEXT        NOT NULL DEFAULT 'habilitacion'
                              CHECK (fase_actual IN (
                                'habilitacion','f1_policial','f2_catastro',
                                'f3f4_operativo','f5_recuperacion','cerrado'
                              )),

  -- Semáforos por dimensión (mismo vocabulario que v1).
  sem_juridico              TEXT NOT NULL DEFAULT 'gris' CHECK (sem_juridico       IN ('verde','ambar','rojo','gris')),
  sem_seguridad             TEXT NOT NULL DEFAULT 'gris' CHECK (sem_seguridad      IN ('verde','ambar','rojo','gris')),
  sem_social                TEXT NOT NULL DEFAULT 'gris' CHECK (sem_social         IN ('verde','ambar','rojo','gris')),
  sem_financiamiento        TEXT NOT NULL DEFAULT 'gris' CHECK (sem_financiamiento IN ('verde','ambar','rojo','gris')),

  -- Físicos del polígono.
  superficie_ha             NUMERIC,
  propietario               TEXT,
  sitios_total              INT,
  sitios_desocupados        INT,         -- Tipo C — desocupación gradual

  -- Campos por dimensión (movidos desde desalojo_detalle v1).
  instrumento               TEXT,
  fecha_instrumento         DATE,
  via_juridica              TEXT,
  notas_juridico            TEXT,
  plan_operativo_listo      BOOLEAN     NOT NULL DEFAULT FALSE,
  contingente               TEXT,
  fecha_tentativa_operativo DATE,
  notas_seguridad           TEXT,
  personas                  INTEGER,
  nna                       INTEGER,
  albergue_validado         BOOLEAN     NOT NULL DEFAULT FALSE,
  notas_social              TEXT,
  costo_demolicion_mm       NUMERIC,
  fuente                    TEXT,
  financiamiento_asegurado  BOOLEAN     NOT NULL DEFAULT FALSE,
  notas_financiamiento      TEXT,

  -- Checklist Paso 0 — items definidos en lib/desalojos.ts según tipología.
  -- Formato: { "item_key": { "done": bool, "fecha": "YYYY-MM-DD" | null } }
  -- Shallow merge en el PATCH handler; items huérfanos (cambio de tipología)
  -- se conservan pero no se renderizan.
  paso0_estado              JSONB       NOT NULL DEFAULT '{}'::jsonb,

  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_desalojo_capas_lookup
  ON desalojo_capas(prioridad_id, activa, orden);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. desalojo_documentos — documentos generales del caso o por capa
-- ─────────────────────────────────────────────────────────────────────────
-- capa_id NULL  = documento del CASO (Contexto, ej. minuta de la Mesa).
-- capa_id NOT NULL + dimension NULL = documento general de esa capa.
-- capa_id NOT NULL + dimension NOT NULL = documento de esa dimensión en esa capa.
--
-- Archivos viven en bucket `desalojos-docs` (privado). `url` guarda el path
-- relativo (no signed URL) — se firma con TTL en el handler GET al servir.

CREATE TABLE IF NOT EXISTS desalojo_documentos (
  id            BIGSERIAL   PRIMARY KEY,
  prioridad_id  INT         NOT NULL,    -- FK lógico
  capa_id       BIGINT,                  -- FK lógico a desalojo_capas.id; NULL = del caso
  dimension     TEXT        CHECK (dimension IN ('juridico','seguridad','social','financiamiento')),
  nombre        TEXT        NOT NULL,
  url           TEXT        NOT NULL,    -- path relativo en el bucket
  tipo_archivo  TEXT,
  tamano_bytes  BIGINT,
  subido_por    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_desalojo_documentos_lookup
  ON desalojo_documentos(prioridad_id, capa_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. capa_id en seguimientos y log existentes
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE desalojo_seguimientos ADD COLUMN IF NOT EXISTS capa_id BIGINT;
ALTER TABLE desalojo_log          ADD COLUMN IF NOT EXISTS capa_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_desalojo_seguimientos_capa
  ON desalojo_seguimientos(capa_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Migrar datos existentes — una capa 1 por cada detalle
-- ─────────────────────────────────────────────────────────────────────────
-- Idempotente: el WHERE NOT EXISTS evita duplicar la capa 1 si la migración
-- se corre dos veces por accidente.

INSERT INTO desalojo_capas (
  prioridad_id, nombre, orden, sem_juridico, sem_seguridad, sem_social, sem_financiamiento,
  instrumento, fecha_instrumento, via_juridica, notas_juridico,
  plan_operativo_listo, contingente, fecha_tentativa_operativo, notas_seguridad,
  personas, nna, albergue_validado, notas_social,
  costo_demolicion_mm, fuente, financiamiento_asegurado, notas_financiamiento
)
SELECT
  d.prioridad_id, 'Polígono único', 0,
  d.sem_juridico, d.sem_seguridad, d.sem_social, d.sem_financiamiento,
  d.instrumento, d.fecha_instrumento, d.via_juridica, d.notas_juridico,
  d.plan_operativo_listo, d.contingente, d.fecha_tentativa_operativo, d.notas_seguridad,
  d.personas, d.nna, d.albergue_validado, d.notas_social,
  d.costo_demolicion_mm, d.fuente, d.financiamiento_asegurado, d.notas_financiamiento
FROM desalojo_detalle d
WHERE NOT EXISTS (
  SELECT 1 FROM desalojo_capas c WHERE c.prioridad_id = d.prioridad_id
);

-- Reasignar seguimientos y log existentes a esa capa 1.
UPDATE desalojo_seguimientos s
   SET capa_id = c.id
  FROM desalojo_capas c
 WHERE c.prioridad_id = s.prioridad_id
   AND c.orden = 0
   AND s.capa_id IS NULL;

UPDATE desalojo_log l
   SET capa_id = c.id
  FROM desalojo_capas c
 WHERE c.prioridad_id = l.prioridad_id
   AND c.orden = 0
   AND l.capa_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. DROP columnas migradas en desalojo_detalle + agregar resumen_narrativo
-- ─────────────────────────────────────────────────────────────────────────
-- Sobreviven: prioridad_id (PK), updated_at, + resumen_narrativo nuevo.
-- Todo lo demás se movió a desalojo_capas.

ALTER TABLE desalojo_detalle
  DROP COLUMN IF EXISTS sem_juridico,
  DROP COLUMN IF EXISTS sem_seguridad,
  DROP COLUMN IF EXISTS sem_social,
  DROP COLUMN IF EXISTS sem_financiamiento,
  DROP COLUMN IF EXISTS instrumento,
  DROP COLUMN IF EXISTS fecha_instrumento,
  DROP COLUMN IF EXISTS via_juridica,
  DROP COLUMN IF EXISTS notas_juridico,
  DROP COLUMN IF EXISTS plan_operativo_listo,
  DROP COLUMN IF EXISTS contingente,
  DROP COLUMN IF EXISTS fecha_tentativa_operativo,
  DROP COLUMN IF EXISTS notas_seguridad,
  DROP COLUMN IF EXISTS personas,
  DROP COLUMN IF EXISTS nna,
  DROP COLUMN IF EXISTS albergue_validado,
  DROP COLUMN IF EXISTS notas_social,
  DROP COLUMN IF EXISTS costo_demolicion_mm,
  DROP COLUMN IF EXISTS fuente,
  DROP COLUMN IF EXISTS financiamiento_asegurado,
  DROP COLUMN IF EXISTS notas_financiamiento,
  ADD  COLUMN IF NOT EXISTS resumen_narrativo TEXT;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RLS admin-only en tablas nuevas
-- ─────────────────────────────────────────────────────────────────────────
-- Patrón idéntico al de las 3 tablas v1 (migración 017): EXISTS subquery
-- a user_profiles + check role = 'admin'.

ALTER TABLE desalojo_capas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE desalojo_documentos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "desalojo_capas_admin_all"      ON desalojo_capas;
DROP POLICY IF EXISTS "desalojo_documentos_admin_all" ON desalojo_documentos;

CREATE POLICY "desalojo_capas_admin_all" ON desalojo_capas
  FOR ALL
  USING       (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK  (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "desalojo_documentos_admin_all" ON desalojo_documentos
  FOR ALL
  USING       (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK  (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- Verificación post-migración (correr en SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────
-- 1) Una capa por cada detalle existente:
--    SELECT (SELECT COUNT(*) FROM desalojo_detalle) AS n_casos,
--           (SELECT COUNT(*) FROM desalojo_capas)   AS n_capas;
--    -- n_casos y n_capas deben ser iguales.
--
-- 2) Seguimientos y log reasignados:
--    SELECT COUNT(*) FROM desalojo_seguimientos WHERE capa_id IS NULL;
--    SELECT COUNT(*) FROM desalojo_log          WHERE capa_id IS NULL;
--    -- Ambos 0.
--
-- 3) Policies admin-only nuevas:
--    SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('desalojo_capas','desalojo_documentos');
--    -- 2 filas (una FOR ALL por tabla).
--
-- 4) Bucket desalojos-docs creado a mano en Supabase dashboard, privado.
