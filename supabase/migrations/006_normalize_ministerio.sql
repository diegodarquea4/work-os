-- ==========================================================================
-- Normalización del campo `ministerio` en prioridades_territoriales
--
-- Antes: 57 strings distintos con casing inconsistente, typos, nombres
-- incompletos y abreviaciones. Después: ~25 carteras canónicas + entidades
-- no-ministeriales (Municipalidad, Gobierno Regional, Poder Judicial,
-- Ministerio Público, Bomberos de Chile).
--
-- Decisiones tomadas con Diego:
--   - Servicios bajo un ministerio (CONAF, SNPC) → mapeados al padre
--   - GORE / Gobierno Regional de Los Ríos      → 'Gobierno Regional'
--   - 'Por definir' → NULL (editable desde el panel — multi-select inline
--     en ProjectTrackerModal con catálogo MINISTERIOS_CANONICOS)
--   - Multi-ministerio se mantiene como 'Min. A · Min. B' (separador "·")
--     y la vista 'Por ministerio' splittea en columnas separadas
-- ==========================================================================

-- ── 1. Hacer ministerio nullable (para "Por definir" → NULL) ───────────────
ALTER TABLE prioridades_territoriales
  ALTER COLUMN ministerio DROP NOT NULL;

-- ── 2. Unificación masiva ──────────────────────────────────────────────────
UPDATE prioridades_territoriales
SET ministerio = CASE
  -- Casing/typos
  WHEN ministerio = 'MINISTERIO DE OBRAS PUBLICAS'                  THEN 'Ministerio de Obras Públicas'
  WHEN ministerio = 'MINISTERIO DE VIVIENDA Y URBANISMO'            THEN 'Ministerio de Vivienda y Urbanismo'
  WHEN ministerio = 'Ministerio de Vivienda'                        THEN 'Ministerio de Vivienda y Urbanismo'
  WHEN ministerio = 'MINISTERIO DEL INTERIOR'                       THEN 'Ministerio del Interior'
  WHEN ministerio = 'MINISTERIO DE SALUD'                           THEN 'Ministerio de Salud'
  WHEN ministerio = 'MINISTERIO DE EDUCACION'                       THEN 'Ministerio de Educación'
  WHEN ministerio = 'Ministerio De Educación'                       THEN 'Ministerio de Educación'
  WHEN ministerio = 'MINISTERIO DE AGRICULTURA'                     THEN 'Ministerio de Agricultura'
  WHEN ministerio = 'Ministerio de Transporte y Telecomunicaciones' THEN 'Ministerio de Transportes y Telecomunicaciones'
  WHEN ministerio = 'MINISTERIO DE TRANSPORTE Y TELECOMUNICACIONES' THEN 'Ministerio de Transportes y Telecomunicaciones'
  WHEN ministerio = 'Ministerio De Transporte y Telecomunicaciones' THEN 'Ministerio de Transportes y Telecomunicaciones'
  WHEN ministerio = 'Ministerio de energía'                         THEN 'Ministerio de Energía'
  WHEN ministerio = 'Ministerio del trabajo y Previsión social'     THEN 'Ministerio del Trabajo y Previsión Social'
  WHEN ministerio = 'MINISTERIO DE JUSTICIA Y DERECHOS HUMANOS'     THEN 'Ministerio de Justicia y Derechos Humanos'
  WHEN ministerio = 'MINISTERIO DE MINERÍA'                         THEN 'Ministerio de Minería'
  WHEN ministerio = 'MINISTERIO DE BIENES NACIONALES'               THEN 'Ministerio de Bienes Nacionales'
  WHEN ministerio = 'MINISTERIO DE DEFENSA NACIONAL'                THEN 'Ministerio de Defensa Nacional'
  WHEN ministerio = 'Ministerio Secretaria General de Gobierno'     THEN 'Ministerio Secretaría General de Gobierno'
  WHEN ministerio = 'Ministerio de la Mujer y Equidad de Género'    THEN 'Ministerio de la Mujer y la Equidad de Género'

  -- Nombres incompletos
  WHEN ministerio = 'Desarrollo Social y Familia'                                    THEN 'Ministerio de Desarrollo Social y Familia'
  WHEN ministerio = 'Secretaria Regional Ministerial de Desarrollo Social y Familia' THEN 'Ministerio de Desarrollo Social y Familia'
  WHEN ministerio = 'Ministerio de Seguridad'                                        THEN 'Ministerio de Seguridad Pública'
  WHEN ministerio = 'Las Culturas las Artes y el  Patrimonio'                        THEN 'Ministerio de las Culturas, las Artes y el Patrimonio'
  WHEN ministerio = '▼Las Culturas las Artes y el Patirmonio'                        THEN 'Ministerio de las Culturas, las Artes y el Patrimonio'
  WHEN ministerio = 'Ministerio de Ciencias, Tecnología, Conocimiento e Innovación'  THEN 'Ministerio de Ciencia, Tecnología, Conocimiento e Innovación'
  WHEN ministerio = 'MINISTERIO PUBLICO'                                             THEN 'Ministerio Público'

  -- Servicios → ministerio padre
  WHEN ministerio = 'CONAF'                                     THEN 'Ministerio de Agricultura'
  WHEN ministerio = 'Servicio Nacional del Patrimonio Cultural' THEN 'Ministerio de las Culturas, las Artes y el Patrimonio'

  -- GORE → Gobierno Regional
  WHEN ministerio = 'GORE'                          THEN 'Gobierno Regional'
  WHEN ministerio = 'Gobierno Regional de Los Ríos' THEN 'Gobierno Regional'

  -- Multi-ministerios (limpiamos abreviaciones, mantenemos separador "·")
  WHEN ministerio = 'Min. de Agricultura (SAG) · Min. de Relaciones Exteriores / PROCHILE'
       THEN 'Ministerio de Agricultura · Ministerio de Relaciones Exteriores'
  WHEN ministerio = 'Min. de Minería · Min. de Hacienda'
       THEN 'Ministerio de Minería · Ministerio de Hacienda'

  ELSE ministerio
END
WHERE ministerio IS NOT NULL;

-- ── 3. 'Por definir' → NULL (queda editable desde el panel) ────────────────
UPDATE prioridades_territoriales
SET ministerio = NULL
WHERE ministerio = 'Por definir';

-- ── 4. Verificación ────────────────────────────────────────────────────────
-- Debe devolver solo nombres canónicos (sin variantes de case ni typos).
-- SELECT ministerio, COUNT(*) AS n
-- FROM prioridades_territoriales
-- WHERE ministerio IS NOT NULL
-- GROUP BY ministerio
-- ORDER BY n DESC, ministerio;
