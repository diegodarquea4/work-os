-- ==========================================================================
-- Work OS v2 — Modelo de datos para Indicadores y Minutas
-- División de Coordinación Interministerial (DCI)
-- Ministerio del Interior
--
-- Estrategia: tablas con prefijo v2_ conviven con v1.
-- En el cutover (Fase 5) se renombran quitando el prefijo.
-- ==========================================================================

-- ── 1. Catálogos (master data) ─────────────────────────────────────────────

-- 1a. Regiones: 17 filas (16 regiones + nacional)
CREATE TABLE IF NOT EXISTS v2_regiones (
  id        SMALLINT    PRIMARY KEY,
  cod       TEXT        NOT NULL UNIQUE,
  nombre    TEXT        NOT NULL,
  capital   TEXT,
  zona      TEXT
);

INSERT INTO v2_regiones (id, cod, nombre, capital, zona) VALUES
  (0,  'NAC',  'Nacional',                  NULL,             NULL),
  (15, 'XV',   'Arica y Parinacota',        'Arica',          'Norte Grande'),
  (1,  'I',    'Tarapacá',                  'Iquique',        'Norte Grande'),
  (2,  'II',   'Antofagasta',               'Antofagasta',    'Norte Grande'),
  (3,  'III',  'Atacama',                   'Copiapó',        'Norte Chico'),
  (4,  'IV',   'Coquimbo',                  'La Serena',      'Norte Chico'),
  (5,  'V',    'Valparaíso',                'Valparaíso',     'Zona Central'),
  (13, 'RM',   'Metropolitana',             'Santiago',        'Zona Central'),
  (6,  'VI',   'O''Higgins',                'Rancagua',       'Zona Central'),
  (7,  'VII',  'Maule',                     'Talca',          'Zona Central'),
  (16, 'XVI',  'Ñuble',                     'Chillán',        'Zona Central'),
  (8,  'VIII', 'Biobío',                    'Concepción',     'Sur'),
  (9,  'IX',   'La Araucanía',              'Temuco',         'Sur'),
  (14, 'XIV',  'Los Ríos',                  'Valdivia',       'Sur'),
  (10, 'X',    'Los Lagos',                 'Puerto Montt',   'Sur'),
  (11, 'XI',   'Aysén',                     'Coyhaique',      'Austral'),
  (12, 'XII',  'Magallanes y Antártica',    'Punta Arenas',   'Austral')
ON CONFLICT (id) DO NOTHING;

-- 1b. Ejes estratégicos de los PREGOs
CREATE TABLE IF NOT EXISTS v2_ejes_estrategicos (
  id      SERIAL  PRIMARY KEY,
  codigo  TEXT    NOT NULL UNIQUE,
  nombre  TEXT    NOT NULL
);

INSERT INTO v2_ejes_estrategicos (codigo, nombre) VALUES
  ('E1', 'Infraestructura y Conectividad'),
  ('E2', 'Energía y Medio Ambiente'),
  ('E3', 'Salud y Servicios Básicos'),
  ('E4', 'Seguridad y Soberanía'),
  ('E5', 'Desarrollo Productivo e Innovación'),
  ('E6', 'Familia, Educación y Equidad Territorial')
ON CONFLICT (codigo) DO NOTHING;

-- 1c. Ministerios
CREATE TABLE IF NOT EXISTS v2_ministerios (
  id      SERIAL  PRIMARY KEY,
  nombre  TEXT    NOT NULL UNIQUE
);

-- 1d. Fuentes de datos oficiales
CREATE TABLE IF NOT EXISTS v2_fuentes (
  id                      SERIAL  PRIMARY KEY,
  codigo                  TEXT    NOT NULL UNIQUE,
  nombre                  TEXT    NOT NULL,
  institucion             TEXT,
  url_base                TEXT,
  notas_metodologicas     TEXT,
  ultima_publicacion      DATE,
  proxima_publicacion     DATE
);

INSERT INTO v2_fuentes (codigo, nombre, institucion, url_base) VALUES
  ('CENSO_INE_2024',   'Censo de Población y Vivienda 2024',            'INE',                          'https://www.ine.gob.cl'),
  ('CASEN_2024',       'Encuesta de Caracterización Socioeconómica 2024','Ministerio de Desarrollo Social','https://observatorio.ministeriodesarrollosocial.gob.cl'),
  ('INE_ENE',          'Encuesta Nacional de Empleo',                    'INE',                          'https://www.ine.gob.cl/estadisticas/sociales/mercado-laboral'),
  ('BCCH_CCNN',        'Cuentas Nacionales — Banco Central',            'Banco Central de Chile',       'https://si3.bcentral.cl'),
  ('BCCH_VENTAS',      'Ventas Regionales — Banco Central',             'Banco Central de Chile',       'https://si3.bcentral.cl'),
  ('BCCH_IMACEC',      'IMACEC — Banco Central',                        'Banco Central de Chile',       'https://si3.bcentral.cl'),
  ('ENUSC_2022',       'Encuesta Nacional Urbana de Seguridad Ciudadana','INE / SPD',                    'https://www.ine.gob.cl/estadisticas/sociales/seguridad-publica'),
  ('DEIS_MINSAL',      'Estadísticas de Salud — DEIS',                  'MINSAL',                       'https://deis.minsal.cl'),
  ('MINEDUC',          'Centro de Estudios MINEDUC',                     'Ministerio de Educación',      'https://centroestudios.mineduc.cl'),
  ('FONASA',           'Fondo Nacional de Salud',                        'FONASA',                       'https://www.fonasa.cl'),
  ('LEYSTOP_CARAB',    'LeyStop — Carabineros de Chile',                'Carabineros / API Colega',     NULL),
  ('SUBTEL',           'Estadísticas de Telecomunicaciones',             'SUBTEL',                       'https://www.subtel.gob.cl'),
  ('DIPRES',           'Dirección de Presupuestos',                      'DIPRES',                       'https://www.dipres.gob.cl'),
  ('SEIA',             'Sistema de Evaluación de Impacto Ambiental',     'SEA',                          'https://seia.sea.gob.cl'),
  ('MOP',              'Ministerio de Obras Públicas',                   'MOP',                          'https://www.mop.gob.cl'),
  ('DCI_MANUAL',       'Carga manual DCI',                               'DCI — Ministerio del Interior',NULL)
ON CONFLICT (codigo) DO NOTHING;


-- ── 2. Catálogo de indicadores ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS v2_indicadores_catalogo (
  codigo                    TEXT    PRIMARY KEY,
  nombre                    TEXT    NOT NULL,
  descripcion               TEXT,
  categoria                 TEXT    NOT NULL,
  subcategoria              TEXT,
  unidad                    TEXT    NOT NULL,
  fuente_id                 INT     REFERENCES v2_fuentes(id),
  frecuencia_esperada       TEXT    NOT NULL DEFAULT 'anual',
  lower_is_better           BOOLEAN NOT NULL DEFAULT FALSE,
  comparable_temporalmente  BOOLEAN NOT NULL DEFAULT TRUE,
  nivel_territorial_min     TEXT    DEFAULT 'regional',
  nivel_criticidad          TEXT    NOT NULL DEFAULT 'complementario'
                            CHECK (nivel_criticidad IN ('esencial', 'complementario', 'archivo')),
  aparece_en_ejecutiva      BOOLEAN NOT NULL DEFAULT FALSE,
  aparece_en_kit_viaje      BOOLEAN NOT NULL DEFAULT FALSE,
  aparece_en_ficha          BOOLEAN NOT NULL DEFAULT FALSE,
  orden_presentacion        INT,
  vigente_desde             DATE    DEFAULT CURRENT_DATE,
  vigente_hasta             DATE,
  notas                     TEXT
);


-- ── 3. Valores de indicadores (espina dorsal, long format) ─────────────────

CREATE TABLE IF NOT EXISTS v2_indicadores_valores (
  id                        BIGSERIAL   PRIMARY KEY,
  codigo_indicador          TEXT        NOT NULL REFERENCES v2_indicadores_catalogo(codigo),
  region_id                 SMALLINT    NOT NULL REFERENCES v2_regiones(id),
  valor                     NUMERIC,
  periodo                   DATE        NOT NULL,
  calidad                   TEXT        NOT NULL DEFAULT 'verificado'
                            CHECK (calidad IN ('verificado', 'preliminar', 'calculado', 'manual')),
  fecha_publicacion_fuente  DATE,
  fecha_carga_sistema       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cargado_por               TEXT,
  notas                     TEXT,
  UNIQUE (codigo_indicador, region_id, periodo)
);

CREATE INDEX IF NOT EXISTS idx_v2_valores_lookup
  ON v2_indicadores_valores (codigo_indicador, region_id, periodo DESC);

CREATE INDEX IF NOT EXISTS idx_v2_valores_region
  ON v2_indicadores_valores (region_id, codigo_indicador);


-- ── 4. Pipeline de datos ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS v2_indicadores_pipeline (
  id                        SERIAL  PRIMARY KEY,
  codigo_indicador          TEXT    NOT NULL REFERENCES v2_indicadores_catalogo(codigo),
  metodo                    TEXT    NOT NULL
                            CHECK (metodo IN ('api_rest', 'sdmx', 'descarga', 'scraping', 'manual')),
  fuente_endpoint           TEXT,
  cron_schedule             TEXT,
  formato_origen            TEXT,
  parser_module             TEXT,
  ultima_ejecucion          TIMESTAMPTZ,
  ultima_ejecucion_estado   TEXT    CHECK (ultima_ejecucion_estado IN ('ok', 'parcial', 'error', 'pendiente')),
  ultima_ejecucion_mensaje  TEXT,
  proxima_ejecucion         TIMESTAMPTZ,
  tolerancia_atraso_dias    INT     DEFAULT 30,
  activo                    BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS v2_indicadores_pipeline_log (
  id                        BIGSERIAL   PRIMARY KEY,
  codigo_indicador          TEXT        NOT NULL,
  ejecutado_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duracion_ms               INT,
  estado                    TEXT        NOT NULL
                            CHECK (estado IN ('ok', 'error', 'sin_datos', 'parcial', 'schema_changed')),
  filas_persistidas         INT         DEFAULT 0,
  errores                   JSONB,
  fuente_response_snapshot  TEXT
);


-- ── 5. Iniciativas (reemplaza prioridades_territoriales) ───────────────────

CREATE TABLE IF NOT EXISTS v2_iniciativas (
  id                        SERIAL      PRIMARY KEY,
  codigo_iniciativa         TEXT,
  region_id                 SMALLINT    NOT NULL REFERENCES v2_regiones(id),
  eje_id                    INT         REFERENCES v2_ejes_estrategicos(id),
  ministerio_id             INT         REFERENCES v2_ministerios(id),
  nombre                    TEXT        NOT NULL,
  descripcion               TEXT,
  prioridad                 TEXT        CHECK (prioridad IN ('Alta', 'Media', 'Baja')),
  etapa_actual              TEXT,
  estado_planificacion      TEXT        DEFAULT 'en_marcha'
                            CHECK (estado_planificacion IN ('planificada', 'en_marcha', 'cerrada')),
  estado_semaforo           TEXT        DEFAULT 'sin_evaluar'
                            CHECK (estado_semaforo IN ('verde', 'ambar', 'rojo', 'sin_evaluar')),
  pct_avance                INT         DEFAULT 0 CHECK (pct_avance >= 0 AND pct_avance <= 100),
  proximo_hito              TEXT,
  fecha_proximo_hito        DATE,
  fuente_financiamiento     TEXT,
  codigo_bip                TEXT,
  inversion_mm_clp          NUMERIC,
  comuna                    TEXT,
  responsable               TEXT,
  fecha_apertura_monitoreo  DATE,
  cargado_por               TEXT        DEFAULT 'DCI',
  fuente_origen             TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_iniciativas_region
  ON v2_iniciativas (region_id);

-- Seguimiento, semáforo log y documentos se crean como companion tables
CREATE TABLE IF NOT EXISTS v2_iniciativas_seguimiento (
  id              SERIAL      PRIMARY KEY,
  iniciativa_id   INT         NOT NULL REFERENCES v2_iniciativas(id) ON DELETE CASCADE,
  fecha           DATE,
  tipo            TEXT        CHECK (tipo IN ('avance', 'reunion', 'hito', 'alerta')),
  descripcion     TEXT        NOT NULL,
  autor           TEXT,
  estado          TEXT        CHECK (estado IN ('en_curso', 'completado', 'bloqueado', 'pendiente')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS v2_iniciativas_semaforo_log (
  id              SERIAL      PRIMARY KEY,
  iniciativa_id   INT         NOT NULL REFERENCES v2_iniciativas(id) ON DELETE CASCADE,
  campo           TEXT        NOT NULL CHECK (campo IN ('semaforo', 'pct_avance')),
  valor_anterior  TEXT,
  valor_nuevo     TEXT        NOT NULL,
  cambiado_por    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS v2_iniciativas_documentos (
  id              SERIAL      PRIMARY KEY,
  iniciativa_id   INT         NOT NULL REFERENCES v2_iniciativas(id) ON DELETE CASCADE,
  nombre          TEXT        NOT NULL,
  url             TEXT        NOT NULL,
  tipo_archivo    TEXT,
  tamano_bytes    INT,
  subido_por      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ── 6. Seguridad semanal (consolida stop_stats + registros_leystop) ────────

CREATE TABLE IF NOT EXISTS v2_seguridad_semanal (
  id                        SERIAL      PRIMARY KEY,
  region_id                 SMALLINT    NOT NULL REFERENCES v2_regiones(id),
  semana_iso                TEXT        NOT NULL,
  fecha_desde               DATE,
  fecha_hasta               DATE,
  tasa_registro             NUMERIC,
  casos_total               INT,
  casos_ultima_semana       INT,
  casos_28dias              INT,
  casos_anno_fecha          INT,
  var_ultima_semana         NUMERIC,
  var_28dias                NUMERIC,
  var_anno_fecha            NUMERIC,
  mayor_registro_1          TEXT,
  pct_1                     NUMERIC,
  mayor_registro_2          TEXT,
  pct_2                     NUMERIC,
  mayor_registro_3          TEXT,
  pct_3                     NUMERIC,
  mayor_registro_4          TEXT,
  pct_4                     NUMERIC,
  mayor_registro_5          TEXT,
  pct_5                     NUMERIC,
  controles_total           INT,
  controles_identidad       INT,
  controles_vehicular       INT,
  fiscalizaciones           INT,
  incautaciones             INT,
  incaut_fuego              INT,
  incaut_blancas            INT,
  allanamientos_anno        INT,
  vehiculos_rec_anno        INT,
  decomisos_anno            NUMERIC,
  UNIQUE (region_id, semana_iso)
);


-- ── 7. Proyectos de inversión (unifica SEIA + MOP) ────────────────────────

CREATE TABLE IF NOT EXISTS v2_proyectos_inversion (
  id                  TEXT        PRIMARY KEY,
  region_id           SMALLINT    NOT NULL REFERENCES v2_regiones(id),
  sistema_origen      TEXT        NOT NULL CHECK (sistema_origen IN ('seia', 'mop')),
  nombre              TEXT        NOT NULL,
  tipo                TEXT,
  estado              TEXT,
  titular             TEXT,
  servicio            TEXT,
  programa            TEXT,
  etapa               TEXT,
  inversion           NUMERIC,
  moneda              TEXT        NOT NULL CHECK (moneda IN ('USD_MM', 'CLP_MILES')),
  fecha_presentacion  DATE,
  url_ficha           TEXT,
  descripcion         TEXT,
  synced_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v2_proyectos_region
  ON v2_proyectos_inversion (region_id);


-- ── 8. Log de minutas (reemplaza minuta_cache — sin contenido) ─────────────

CREATE TABLE IF NOT EXISTS v2_minutas_log (
  id              SERIAL      PRIMARY KEY,
  region_id       SMALLINT    NOT NULL REFERENCES v2_regiones(id),
  tipo            TEXT        NOT NULL CHECK (tipo IN ('ejecutiva', 'kit_viaje', 'ficha')),
  generado_por    TEXT,
  generado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hash_pdf        TEXT,
  parametros      JSONB,
  duracion_ms     INT
);


-- ── 9. Vista materializada: último valor por (indicador, región) ──────────

CREATE MATERIALIZED VIEW IF NOT EXISTS v2_indicadores_ultimo AS
SELECT DISTINCT ON (codigo_indicador, region_id)
  codigo_indicador,
  region_id,
  valor,
  periodo,
  calidad,
  fecha_carga_sistema
FROM v2_indicadores_valores
ORDER BY codigo_indicador, region_id, periodo DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_v2_ultimo_lookup
  ON v2_indicadores_ultimo (codigo_indicador, region_id);


-- ── 10. RPC function for refreshing the materialized view ─────────────────
-- Called from /api/v2/refresh-views endpoint

CREATE OR REPLACE FUNCTION refresh_v2_indicadores_ultimo()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW v2_indicadores_ultimo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Done ───────────────────────────────────────────────────────────────────
-- Run REFRESH MATERIALIZED VIEW v2_indicadores_ultimo; after data migration.
