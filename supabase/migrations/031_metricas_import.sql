-- 031_metricas_import.sql
-- Import de las 11 tablas del dashboard de Métricas (originalmente en
-- proyecto Supabase spkfoavwjadyxjlcgkhq de Manuel) al proyecto
-- Seguimiento DCI Regional (hufgtspktblxxkwocsof) para consolidar
-- dashboards en un solo Supabase.
--
-- Naming: opción A (literal). Se copian los nombres originales de las
-- tablas y columnas sin prefijar. Deuda declarada: `regiones` (16 filas)
-- convive con `v2_regiones` (17 filas) del sistema principal. El
-- dashboard de Métricas lee de `regiones`; el resto del sistema sigue
-- usando `v2_regiones`.
--
-- RLS: todas las tablas quedan con RLS enabled + policy SELECT para el
-- rol `public` (qual = true). Read-only para cualquier cliente. No hay
-- policies de INSERT/UPDATE/DELETE — la carga de datos y la actualización
-- futura se hace con service role.
--
-- Sequences: usamos SERIAL para que los nombres de secuencia queden
-- exactamente como <tabla>_<columna>_seq, matcheando lo que va a
-- referenciar el pg_dump --data-only de Ronda 2 (SETVAL).

-- ============================================================
-- Nivel 0: tablas sin foreign keys
-- ============================================================

CREATE TABLE public.registros_bce (
  id                SERIAL PRIMARY KEY,
  series_id         text,
  nombre_region     text,
  indicador_limpio  text,
  unidad_limpia     text,
  periodo           text,
  valor_corregido   numeric,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE public.registros_bce_empleo (
  id             SERIAL PRIMARY KEY,
  serie_id       text,
  nombre_region  text,
  indicador      text,
  unidad         text,
  periodo        text,
  valor          numeric,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE public.adis_catalogo (
  id            SERIAL PRIMARY KEY,
  codigo        text,
  nombre        text,
  unidad        text,
  periodicidad  text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE public.regiones (
  cod_region  text PRIMARY KEY,
  nombre      text NOT NULL
);

CREATE TABLE public.casen_regiones (
  id          SERIAL PRIMARY KEY,
  region      text,
  anno        integer,
  datos       jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE public.bce_catalogo (
  series_id       text PRIMARY KEY,
  frecuencia      text,
  titulo_esp      text,
  primera_obs     text,
  ultima_obs      text,
  actualizado     text,
  es_regional     integer,
  fecha_catalogo  text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE public.registros_bcn (
  id              SERIAL PRIMARY KEY,
  cod_region      text,
  nombre_region   text,
  anno            integer,
  seccion         text,
  subtabla        text,
  indicador       text,
  nivel           text,
  valor           numeric,
  valor_texto     text,
  fuente          text,
  fecha_descarga  text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE public.leystop_semanas (
  id               integer PRIMARY KEY,
  nombre           text,
  semana           text,
  anno             integer,
  fecha_desde_iso  text,
  fecha_hasta_iso  text,
  created_at       timestamptz DEFAULT now()
);

-- ============================================================
-- Nivel 1: tablas con foreign keys
-- ============================================================

CREATE TABLE public.registros_adis (
  id            SERIAL PRIMARY KEY,
  indicador_id  integer REFERENCES public.adis_catalogo(id),
  region        text,
  periodo       text,
  valor         numeric,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE public.registros_leystop_delitos (
  id                 SERIAL PRIMARY KEY,
  id_semana          integer REFERENCES public.leystop_semanas(id),
  id_region          integer,
  nombre_region      text,
  nombre_delito      text,
  es_dmcs            boolean,
  ultima_semana_ant  integer,
  ultima_semana      integer,
  dias28_ant         integer,
  dias28             integer,
  anno_fecha_ant     integer,
  anno_fecha         integer,
  umbral             text,
  created_at         timestamptz DEFAULT now(),
  anno               integer,
  semana             text,
  fecha_desde_iso    text,
  fecha_hasta_iso    text
);

CREATE TABLE public.registros_leystop (
  id                         SERIAL PRIMARY KEY,
  id_semana                  integer REFERENCES public.leystop_semanas(id),
  id_region                  numeric,
  nombre_region              text,
  semana                     text,
  fecha_desde_iso            text,
  fecha_hasta_iso            text,
  anno                       integer,
  tasa_registro              numeric,
  casos_total                numeric,
  casos_anno_fecha           numeric,
  casos_anno_fecha_anterior  numeric,
  var_anno_fecha             numeric,
  var_ultima_semana          numeric,
  var_28dias                 numeric,
  casos_ultima_semana        numeric,
  casos_28dias               numeric,
  mayor_registro_1           text,
  pct_1                      numeric,
  mayor_registro_2           text,
  pct_2                      numeric,
  mayor_registro_3           text,
  pct_3                      numeric,
  mayor_registro_4           text,
  pct_4                      numeric,
  mayor_registro_5           text,
  pct_5                      numeric,
  controles                  numeric,
  controles_identidad        numeric,
  controles_vehicular        numeric,
  fiscalizaciones            numeric,
  fiscal_alcohol             numeric,
  fiscal_bancaria            numeric,
  incautaciones              numeric,
  incaut_fuego               numeric,
  incaut_blancas             numeric,
  allanamientos_anno         numeric,
  vehiculos_recuperados_anno numeric,
  decomisos_anno             numeric,
  created_at                 timestamptz DEFAULT now()
);

-- ============================================================
-- RLS: enable + policies SELECT para el rol public (read-only)
-- ============================================================

ALTER TABLE public.registros_bce              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_bce_empleo       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adis_catalogo              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regiones                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casen_regiones             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bce_catalogo               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_bcn              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leystop_semanas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_adis             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_leystop_delitos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_leystop          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "metricas_registros_bce_select"             ON public.registros_bce             FOR SELECT TO public USING (true);
CREATE POLICY "metricas_registros_bce_empleo_select"      ON public.registros_bce_empleo      FOR SELECT TO public USING (true);
CREATE POLICY "metricas_adis_catalogo_select"             ON public.adis_catalogo             FOR SELECT TO public USING (true);
CREATE POLICY "metricas_regiones_select"                  ON public.regiones                  FOR SELECT TO public USING (true);
CREATE POLICY "metricas_casen_regiones_select"            ON public.casen_regiones            FOR SELECT TO public USING (true);
CREATE POLICY "metricas_bce_catalogo_select"              ON public.bce_catalogo              FOR SELECT TO public USING (true);
CREATE POLICY "metricas_registros_bcn_select"             ON public.registros_bcn             FOR SELECT TO public USING (true);
CREATE POLICY "metricas_leystop_semanas_select"           ON public.leystop_semanas           FOR SELECT TO public USING (true);
CREATE POLICY "metricas_registros_adis_select"            ON public.registros_adis            FOR SELECT TO public USING (true);
CREATE POLICY "metricas_registros_leystop_delitos_select" ON public.registros_leystop_delitos FOR SELECT TO public USING (true);
CREATE POLICY "metricas_registros_leystop_select"         ON public.registros_leystop         FOR SELECT TO public USING (true);
