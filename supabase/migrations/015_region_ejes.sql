-- ════════════════════════════════════════════════════════════════════════════
-- 015 — Catálogo formal de ejes por región
--
-- Reemplaza el modelo actual de `eje` como TEXT libre en
-- prioridades_territoriales por un catálogo normalizado per-region. Cada
-- región del DCI define sus propios ejes con número (1..N) y nombre. Las
-- iniciativas y métricas referencian al catálogo por FK.
--
-- Diseño confirmado con Diego:
--   - `region_ejes.nombre` guarda SOLO el nombre puro ("Salud y Servicios
--     Básicos"). El prefijo "Eje N:" se compone en UI via composeEjeLabel().
--   - Solo admin/editor DCI gestiona el catálogo (RLS).
--   - Migración automática parseando los strings actuales con regex
--     case-insensitive. Auditoría al final debe devolver 0 filas.
--   - Columna `eje` TEXT se conserva durante transición (dual-write hasta
--     Fase 5 del plan, donde se evalúa el DROP).
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- 1. Catálogo de ejes por región
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS region_ejes (
  id               BIGSERIAL   PRIMARY KEY,
  region_cod       TEXT        NOT NULL,
  numero           INT         NOT NULL CHECK (numero > 0 AND numero < 100),
  nombre           TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT,
  UNIQUE (region_cod, numero)
);

CREATE INDEX IF NOT EXISTS idx_region_ejes_region
  ON region_ejes (region_cod, numero);

ALTER TABLE region_ejes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "region_ejes_read"   ON region_ejes;
DROP POLICY IF EXISTS "region_ejes_insert" ON region_ejes;
DROP POLICY IF EXISTS "region_ejes_update" ON region_ejes;
DROP POLICY IF EXISTS "region_ejes_delete" ON region_ejes;

-- Lectura: cualquier autenticado (el regional necesita ver el catálogo de su
-- región para el dropdown del Excel/UI).
CREATE POLICY "region_ejes_read"
  ON region_ejes FOR SELECT USING (true);

-- Crear / editar / borrar: solo admin/editor DCI (consultamos user_profiles).
CREATE POLICY "region_ejes_insert"
  ON region_ejes FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin','editor')
    )
  );

CREATE POLICY "region_ejes_update"
  ON region_ejes FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin','editor')
    )
  );

CREATE POLICY "region_ejes_delete"
  ON region_ejes FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin','editor')
    )
  );

-- ────────────────────────────────────────────────────────────────────────
-- 2. FK en prioridades_territoriales (nullable durante migración gradual)
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE prioridades_territoriales
  ADD COLUMN IF NOT EXISTS eje_id BIGINT REFERENCES region_ejes(id);

CREATE INDEX IF NOT EXISTS idx_prioridades_eje_id
  ON prioridades_territoriales (eje_id);

-- ────────────────────────────────────────────────────────────────────────
-- 3. FK en metricas_eje (reemplaza eje TEXT como clave funcional)
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE metricas_eje
  ADD COLUMN IF NOT EXISTS eje_id BIGINT REFERENCES region_ejes(id);

CREATE INDEX IF NOT EXISTS idx_metricas_eje_id
  ON metricas_eje (eje_id);

-- ────────────────────────────────────────────────────────────────────────
-- 4. Backfill: poblar region_ejes desde prioridades_territoriales existentes
--
-- Ojo: `prioridades_territoriales` usa la columna `cod` para el código de
-- región (no `region_cod` como otras tablas). El catálogo `region_ejes`
-- sí usa `region_cod` como nombre canónico — acá hacemos el mapeo.
--
-- Parser case-insensitive. Acepta: "Eje 1: Nombre", "EJE 1 — Nombre",
-- "eje 1 - Nombre", "Eje 1 – Nombre". El separador puede ser ":", "—",
-- "–" (en dash) o "-" (hyphen). Whitespace tolerante.
-- ────────────────────────────────────────────────────────────────────────
WITH parsed AS (
  SELECT DISTINCT
    cod AS region_cod,
    (regexp_match(eje, '^\s*eje\s+(\d+)', 'i'))[1]::INT AS numero,
    btrim(regexp_replace(eje, '^\s*eje\s+\d+\s*[:—–\-]\s*', '', 'i')) AS nombre
  FROM prioridades_territoriales
  WHERE eje IS NOT NULL
    AND eje ~* '^\s*eje\s+\d+'  -- solo filas con número parseable
)
INSERT INTO region_ejes (region_cod, numero, nombre, created_by_email)
SELECT region_cod, numero, nombre, 'migration:015'
FROM parsed
WHERE numero IS NOT NULL AND nombre <> ''
ON CONFLICT (region_cod, numero) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────
-- 5. Backfill eje_id en prioridades_territoriales
-- (matchea por p.cod = re.region_cod + número parseado del string)
-- ────────────────────────────────────────────────────────────────────────
UPDATE prioridades_territoriales p
SET eje_id = re.id
FROM region_ejes re
WHERE p.cod = re.region_cod
  AND (regexp_match(p.eje, '^\s*eje\s+(\d+)', 'i'))[1]::INT = re.numero
  AND p.eje_id IS NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 6. Backfill eje_id en metricas_eje
-- (tabla recién creada en 014, puede estar vacía o tener pocas filas)
-- ────────────────────────────────────────────────────────────────────────
UPDATE metricas_eje m
SET eje_id = re.id
FROM region_ejes re
WHERE m.region_cod = re.region_cod
  AND (regexp_match(m.eje, '^\s*eje\s+(\d+)', 'i'))[1]::INT = re.numero
  AND m.eje_id IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- AUDITORÍA POST-MIGRACIÓN
--
-- Correr estas queries manualmente después de la migración:
--
-- 1) Cuántos ejes quedaron en el catálogo:
--    SELECT region_cod, COUNT(*) AS ejes
--    FROM region_ejes
--    GROUP BY region_cod
--    ORDER BY region_cod;
--
-- 2) Iniciativas que NO se pudieron migrar (debe devolver 0 filas):
--    SELECT cod AS region_cod, eje, COUNT(*) AS filas
--    FROM prioridades_territoriales
--    WHERE eje_id IS NULL AND eje IS NOT NULL
--    GROUP BY cod, eje
--    ORDER BY cod;
--
-- 3) Métricas huérfanas (debe devolver 0 filas si había datos en 014):
--    SELECT region_cod, eje
--    FROM metricas_eje
--    WHERE eje_id IS NULL;
--
-- 4) Vista final del mapeo región → eje → cantidad:
--    SELECT p.cod AS region_cod, re.numero, re.nombre, COUNT(*) AS iniciativas
--    FROM prioridades_territoriales p
--    JOIN region_ejes re ON p.eje_id = re.id
--    GROUP BY p.cod, re.numero, re.nombre
--    ORDER BY p.cod, re.numero;
-- ════════════════════════════════════════════════════════════════════════════
