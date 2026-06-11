-- =============================================================================
-- schema-baseline.sql
--
-- Foto del esquema vigente de la BD Work OS al 2026-06-11.
--
-- ⚠️  IMPORTANTE:
--   - Este archivo NO es una migración ejecutable.
--   - NO LO CORRAS contra la base. No tiene orden de dependencias resuelto,
--     no es idempotente, y cualquier diferencia con prod podría provocar
--     pérdida de datos.
--   - Es una REFERENCIA para reconstruir mentalmente la BD desde el repo y
--     para futuras decisiones de borrado de tablas v1, renombres, etc.
--
-- Cierra el hallazgo de la auditoría: hoy las tablas v1 (prioridades_territoriales,
-- seguimientos, documentos_prioridad, region_metrics, regional_metrics,
-- user_profiles, semaforo_log, desalojo_log, prego_monitoreo) no tienen
-- CREATE TABLE en supabase/migrations/. Esta es la primera "foto" del esquema
-- como código.
--
-- Cómo regenerar:
--   1. En Supabase SQL Editor, correr las queries de la sección "Queries para
--      regenerar" al final de este archivo.
--   2. Pegar el output en el bloque correspondiente arriba (TABLES, INDEXES,
--      POLICIES, FUNCTIONS).
--   3. Si la opción es disponible (acceso CLI), usar:
--        pg_dump --schema-only --no-owner --no-privileges -n public > schema-baseline.sql
--      desde un cliente con permisos.
--
-- Generado por: Etapa 0 de la consolidación backend.
-- =============================================================================


-- =============================================================================
-- TABLES
-- =============================================================================
-- Pegar acá el DDL de CREATE TABLE de todas las tablas en schema `public`.
-- Generar con la query 1 de "Queries para regenerar" al final.

-- | ddl                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CREATE TABLE public.autoridades_regionales (
  id integer NOT NULL DEFAULT nextval('autoridades_regionales_id_seq'::regclass),
  region_cod text NOT NULL,
  cargo text NOT NULL,
  nombre text NOT NULL,
  partido text,
  coalicion text,
  territorio text,
  updated_at timestamp with time zone DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| CREATE TABLE public.desalojo_capas (
  id bigint NOT NULL DEFAULT nextval('desalojo_capas_id_seq'::regclass),
  prioridad_id integer NOT NULL,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  activa boolean NOT NULL DEFAULT true,
  tipologia text,
  tipologia_nota text,
  tipologia_asignada_at timestamp with time zone,
  fase_actual text NOT NULL DEFAULT 'pr'::text,
  superficie_ha numeric,
  propietario text,
  sitios_total integer,
  sitios_desocupados integer,
  instrumento text,
  fecha_instrumento date,
  via_juridica text,
  notas_juridico text,
  plan_operativo_listo boolean NOT NULL DEFAULT false,
  contingente text,
  fecha_tentativa_operativo date,
  notas_seguridad text,
  personas integer,
  nna integer,
  albergue_validado boolean NOT NULL DEFAULT false,
  notas_social text,
  costo_demolicion_mm numeric,
  fuente text,
  financiamiento_asegurado boolean NOT NULL DEFAULT false,
  notas_financiamiento text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  viviendas integer,
  hogares integer,
  adultos_mayores integer,
  embarazadas integer,
  personas_discapacidad integer,
  migrantes_regular integer,
  migrantes_irregular integer,
  responsables jsonb NOT NULL DEFAULT '{}'::jsonb,
  folio_minvu text,
  lat numeric,
  lng numeric
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| CREATE TABLE public.desalojo_detalle (
  prioridad_id integer NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  resumen_narrativo text
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CREATE TABLE public.desalojo_documentos (
  id bigint NOT NULL DEFAULT nextval('desalojo_documentos_id_seq'::regclass),
  prioridad_id integer NOT NULL,
  capa_id bigint,
  dimension text,
  nombre text NOT NULL,
  url text NOT NULL,
  tipo_archivo text,
  tamano_bytes bigint,
  subido_por text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  fase text,
  item_key text
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| CREATE TABLE public.desalojo_fase_estado (
  id bigint NOT NULL DEFAULT nextval('desalojo_fase_estado_id_seq'::regclass),
  prioridad_id integer NOT NULL,
  capa_id bigint NOT NULL,
  fase text NOT NULL,
  semaforo text NOT NULL DEFAULT 'gris'::text,
  checklist_estado jsonb NOT NULL DEFAULT '{}'::jsonb,
  notas text,
  completed_at timestamp with time zone,
  completed_by text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| CREATE TABLE public.desalojo_log (
  id bigint NOT NULL DEFAULT nextval('desalojo_log_id_seq'::regclass),
  prioridad_id integer NOT NULL,
  campo text NOT NULL,
  valor_anterior text,
  valor_nuevo text NOT NULL,
  cambiado_por text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  capa_id bigint,
  fase text
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| CREATE TABLE public.desalojo_seguimientos (
  id bigint NOT NULL DEFAULT nextval('desalojo_seguimientos_id_seq'::regclass),
  prioridad_id integer NOT NULL,
  dimension text NOT NULL,
  tipo text NOT NULL,
  descripcion text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by text,
  capa_id bigint
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| CREATE TABLE public.documentos_prioridad (
  id bigint NOT NULL,
  prioridad_id integer NOT NULL,
  nombre text NOT NULL,
  url text NOT NULL,
  tipo_archivo text,
  tamano_bytes bigint,
  subido_por text,
  created_at timestamp with time zone DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| CREATE TABLE public.import_log (
  id bigint NOT NULL DEFAULT nextval('import_log_id_seq'::regclass),
  run_at timestamp with time zone NOT NULL DEFAULT now(),
  applied_by_id uuid,
  applied_by_email text NOT NULL,
  source text NOT NULL,
  proposal_id bigint,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  errors jsonb,
  regions_touched text[],
  duration_ms integer
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| CREATE TABLE public.import_proposals (
  id bigint NOT NULL DEFAULT nextval('import_proposals_id_seq'::regclass),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  proposer_id uuid NOT NULL,
  proposer_email text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  regions_claim text[],
  proposer_note text,
  status text NOT NULL DEFAULT 'pending'::text,
  reviewer_id uuid,
  reviewer_email text,
  reviewer_note text,
  reviewed_at timestamp with time zone,
  applied_inserted integer,
  applied_updated integer,
  applied_errors jsonb
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| CREATE TABLE public.metricas_eje (
  id bigint NOT NULL DEFAULT nextval('metricas_eje_id_seq'::regclass),
  region_cod text NOT NULL,
  eje text NOT NULL,
  titulo text NOT NULL,
  descripcion text,
  objetivo numeric NOT NULL,
  valor_actual numeric,
  unidad text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by_email text,
  valor_updated_by_email text,
  valor_updated_at timestamp with time zone,
  eje_id bigint
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| CREATE TABLE public.minuta_cache (
  region_cod text NOT NULL,
  tipo text NOT NULL,
  cache_date date NOT NULL,
  ai_content jsonb NOT NULL,
  generated_by uuid,
  generated_at timestamp with time zone DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| CREATE TABLE public.mop_projects (
  cod_p text NOT NULL,
  bip text,
  region_id integer NOT NULL,
  nombre text NOT NULL,
  servicio text,
  programa text,
  etapa text,
  financiamiento text,
  inversion_miles bigint,
  provincias text,
  comunas text,
  planes text,
  descripcion text,
  synced_at timestamp with time zone NOT NULL DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CREATE TABLE public.planes_regionales (
  region_cod text NOT NULL,
  archivo_url text,
  uploaded_at timestamp with time zone DEFAULT now(),
  uploaded_by text
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| CREATE TABLE public.prego_monitoreo (
  region_cod text NOT NULL,
  f0_contacto text NOT NULL DEFAULT 'pendiente'::text,
  f1_borrador text NOT NULL DEFAULT 'pendiente'::text,
  f2_revision text NOT NULL DEFAULT 'pendiente'::text,
  e3_dipres text NOT NULL DEFAULT 'pendiente'::text,
  e3_desi text NOT NULL DEFAULT 'pendiente'::text,
  e3_subdere text NOT NULL DEFAULT 'pendiente'::text,
  e3_gore text NOT NULL DEFAULT 'pendiente'::text,
  f6_consolidacion text NOT NULL DEFAULT 'pendiente'::text,
  f7_firma text NOT NULL DEFAULT 'pendiente'::text,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by text
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CREATE TABLE public.prioridades_territoriales (
  id integer NOT NULL DEFAULT nextval('prioridades_territoriales_id_seq'::regclass),
  n integer NOT NULL,
  region text NOT NULL,
  cod text NOT NULL,
  capital text NOT NULL,
  zona text NOT NULL,
  eje text NOT NULL,
  nombre text NOT NULL,
  ministerio text,
  prioridad text NOT NULL,
  estado_semaforo text DEFAULT 'gris'::text,
  pct_avance integer DEFAULT 0,
  responsable text,
  codigo_iniciativa text,
  descripcion text,
  etapa_actual text,
  estado_termino_gobierno text,
  proximo_hito text,
  fecha_proximo_hito date,
  fuente_financiamiento text,
  codigo_bip text,
  inversion_mm numeric,
  comuna text,
  rat text,
  eje_gobierno text,
  origen text,
  en_foco boolean NOT NULL DEFAULT false,
  eje_id bigint,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  es_desalojo boolean NOT NULL DEFAULT false
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| CREATE TABLE public.region_ejes (
  id bigint NOT NULL DEFAULT nextval('region_ejes_id_seq'::regclass),
  region_cod text NOT NULL,
  numero integer NOT NULL,
  nombre text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by_email text
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| CREATE TABLE public.region_metrics (
  region_cod text NOT NULL,
  region_nombre text NOT NULL,
  superficie_km2 numeric,
  pct_territorio_nacional numeric,
  provincias_n integer,
  comunas_n integer,
  poblacion_total integer,
  pct_inmigrantes numeric,
  pct_indigena numeric,
  pct_urbana numeric,
  pct_rural numeric,
  densidad_poblacional numeric,
  promedio_edad numeric,
  pct_pobreza_ingresos numeric,
  pct_pobreza_extrema numeric,
  pct_pobreza_multidimensional numeric,
  pct_pobreza_severa numeric,
  hogares_rsh_tramo40 integer,
  pct_rsh_tramo40 numeric,
  tasa_desocupacion numeric,
  tasa_ocupacion numeric,
  tasa_participacion_laboral numeric,
  tasa_ocupacion_informal numeric,
  pib_regional numeric,
  pct_pib_nacional numeric,
  variacion_interanual numeric,
  inversion_publica_ejecutada numeric,
  inversion_fndr numeric,
  pct_fonasa numeric,
  hospitales_n integer,
  camas_por_1000_hab numeric,
  lista_espera_n integer,
  matricula_escolar_total integer,
  anios_escolaridad_promedio numeric,
  tasa_alfabetismo numeric,
  cobertura_parvularia_pct numeric,
  deficit_habitacional integer,
  pct_hacinamiento numeric,
  pct_acceso_agua_publica numeric,
  pct_hogares_victimas_dmcs numeric,
  pct_percepcion_inseguridad numeric,
  tasa_denuncias_100k numeric,
  tasa_delitos_100k numeric,
  pct_hogares_internet numeric,
  localidades_aisladas_n integer,
  pct_superficie_protegida numeric,
  residuos_domiciliarios_percapita numeric,
  sectores_productivos_principales text,
  vocacion_regional text,
  updated_at timestamp with time zone DEFAULT now(),
  n_deficit_cuantitativo integer,
  pct_viv_irrecuperables numeric(5,2),
  pct_tenencia_arrendada numeric(5,2),
  pct_educacion_superior numeric(5,2),
  pct_internet_movil numeric(5,2),
  pct_internet_fijo numeric(5,2),
  n_discapacidad integer,
  pct_jefatura_mujer numeric(5,2),
  n_inmigrantes integer,
  n_pueblos_orig integer,
  prom_edad numeric,
  pct_edad_60_mas numeric,
  n_ocupado integer,
  n_desocupado integer,
  pct_viv_hacinadas numeric,
  censo_updated_at timestamp with time zone,
  pct_hombres numeric,
  pct_mujeres numeric
); |
| CREATE TABLE public.regional_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  region_id integer NOT NULL,
  metric_name text NOT NULL,
  value numeric NOT NULL,
  period date NOT NULL,
  source_url text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| CREATE TABLE public.security_weekly (
  id integer NOT NULL DEFAULT nextval('security_weekly_id_seq'::regclass),
  region_id integer NOT NULL,
  fecha_desde date NOT NULL,
  fecha_hasta date NOT NULL,
  anno integer,
  semana text,
  tasa_registro real,
  casos_semana integer,
  var_semana_pct real,
  delito_1 text,
  pct_1 real,
  delito_2 text,
  pct_2 real,
  delito_3 text,
  pct_3 real
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| CREATE TABLE public.seguimientos (
  id bigint NOT NULL,
  prioridad_id integer NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL DEFAULT 'avance'::text,
  descripcion text NOT NULL,
  autor text,
  estado text,
  created_at timestamp with time zone DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| CREATE TABLE public.seia_projects (
  id text NOT NULL,
  region_id integer NOT NULL,
  nombre text NOT NULL,
  tipo text,
  estado text,
  titular text,
  inversion_mm numeric,
  fecha_presentacion date,
  fecha_plazo date,
  actividad_actual text,
  url_ficha text,
  synced_at timestamp with time zone NOT NULL DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| CREATE TABLE public.semaforo_log (
  id bigint NOT NULL,
  prioridad_id integer,
  campo text NOT NULL,
  valor_anterior text,
  valor_nuevo text NOT NULL,
  cambiado_por text,
  created_at timestamp with time zone DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| CREATE TABLE public.stop_stats (
  region_id smallint NOT NULL,
  semana_id integer NOT NULL,
  fecha_desde date NOT NULL,
  fecha_hasta date NOT NULL,
  controles_total integer,
  controles_identidad integer,
  controles_vehicular integer,
  fiscalizaciones integer,
  fiscal_alcohol integer,
  fiscal_bancaria integer,
  incautaciones integer,
  incaut_fuego integer,
  incaut_blancas integer,
  decomisos_semana numeric,
  decomisos_anno numeric,
  allanamientos_semana integer,
  allanamientos_anno integer,
  vehiculos_rec_semana integer,
  vehiculos_rec_anno integer,
  casos_total integer,
  casos_ultima_semana integer,
  casos_28dias integer,
  casos_anno_fecha integer,
  mayor_registro_1 text,
  pct_1 numeric,
  mayor_registro_2 text,
  pct_2 numeric,
  mayor_registro_3 text,
  pct_3 numeric,
  mayor_registro_4 text,
  pct_4 numeric,
  mayor_registro_5 text,
  pct_5 numeric,
  synced_at timestamp with time zone DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| CREATE TABLE public.sync_status (
  name text NOT NULL,
  last_run_at timestamp with time zone NOT NULL DEFAULT now(),
  last_status text NOT NULL,
  last_duration_ms integer,
  last_rows integer,
  last_error_count integer NOT NULL DEFAULT 0,
  last_error_sample text,
  notes text
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'viewer'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  region_cods text[] DEFAULT '{}'::text[]
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| CREATE TABLE public.v2_ejes_estrategicos (
  id integer NOT NULL DEFAULT nextval('v2_ejes_estrategicos_id_seq'::regclass),
  codigo text NOT NULL,
  nombre text NOT NULL
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| CREATE TABLE public.v2_fuentes (
  id integer NOT NULL DEFAULT nextval('v2_fuentes_id_seq'::regclass),
  codigo text NOT NULL,
  nombre text NOT NULL,
  institucion text,
  url_base text,
  notas_metodologicas text,
  ultima_publicacion date,
  proxima_publicacion date
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| CREATE TABLE public.v2_indicadores_catalogo (
  codigo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  categoria text NOT NULL,
  subcategoria text,
  unidad text NOT NULL,
  fuente_id integer,
  frecuencia_esperada text NOT NULL DEFAULT 'anual'::text,
  lower_is_better boolean NOT NULL DEFAULT false,
  comparable_temporalmente boolean NOT NULL DEFAULT true,
  nivel_territorial_min text DEFAULT 'regional'::text,
  nivel_criticidad text NOT NULL DEFAULT 'complementario'::text,
  aparece_en_ejecutiva boolean NOT NULL DEFAULT false,
  aparece_en_kit_viaje boolean NOT NULL DEFAULT false,
  aparece_en_ficha boolean NOT NULL DEFAULT false,
  orden_presentacion integer,
  vigente_desde date DEFAULT CURRENT_DATE,
  vigente_hasta date,
  notas text
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| CREATE TABLE public.v2_indicadores_pipeline (
  id integer NOT NULL DEFAULT nextval('v2_indicadores_pipeline_id_seq'::regclass),
  codigo_indicador text NOT NULL,
  metodo text NOT NULL,
  fuente_endpoint text,
  cron_schedule text,
  formato_origen text,
  parser_module text,
  ultima_ejecucion timestamp with time zone,
  ultima_ejecucion_estado text,
  ultima_ejecucion_mensaje text,
  proxima_ejecucion timestamp with time zone,
  tolerancia_atraso_dias integer DEFAULT 30,
  activo boolean DEFAULT true
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| CREATE TABLE public.v2_indicadores_pipeline_log (
  id bigint NOT NULL DEFAULT nextval('v2_indicadores_pipeline_log_id_seq'::regclass),
  codigo_indicador text NOT NULL,
  ejecutado_at timestamp with time zone NOT NULL DEFAULT now(),
  duracion_ms integer,
  estado text NOT NULL,
  filas_persistidas integer DEFAULT 0,
  errores jsonb,
  fuente_response_snapshot text
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| CREATE TABLE public.v2_indicadores_valores (
  id bigint NOT NULL DEFAULT nextval('v2_indicadores_valores_id_seq'::regclass),
  codigo_indicador text NOT NULL,
  region_id smallint NOT NULL,
  valor numeric,
  periodo date NOT NULL,
  calidad text NOT NULL DEFAULT 'verificado'::text,
  fecha_publicacion_fuente date,
  fecha_carga_sistema timestamp with time zone NOT NULL DEFAULT now(),
  cargado_por text,
  notas text
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| CREATE TABLE public.v2_iniciativas (
  id integer NOT NULL DEFAULT nextval('v2_iniciativas_id_seq'::regclass),
  codigo_iniciativa text,
  region_id smallint NOT NULL,
  eje_id integer,
  ministerio_id integer,
  nombre text NOT NULL,
  descripcion text,
  prioridad text,
  etapa_actual text,
  estado_planificacion text DEFAULT 'en_marcha'::text,
  estado_semaforo text DEFAULT 'sin_evaluar'::text,
  pct_avance integer DEFAULT 0,
  proximo_hito text,
  fecha_proximo_hito date,
  fuente_financiamiento text,
  codigo_bip text,
  inversion_mm_clp numeric,
  comuna text,
  responsable text,
  fecha_apertura_monitoreo date,
  cargado_por text DEFAULT 'DCI'::text,
  fuente_origen text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| CREATE TABLE public.v2_iniciativas_documentos (
  id integer NOT NULL DEFAULT nextval('v2_iniciativas_documentos_id_seq'::regclass),
  iniciativa_id integer NOT NULL,
  nombre text NOT NULL,
  url text NOT NULL,
  tipo_archivo text,
  tamano_bytes integer,
  subido_por text,
  created_at timestamp with time zone DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| CREATE TABLE public.v2_iniciativas_seguimiento (
  id integer NOT NULL DEFAULT nextval('v2_iniciativas_seguimiento_id_seq'::regclass),
  iniciativa_id integer NOT NULL,
  fecha date,
  tipo text,
  descripcion text NOT NULL,
  autor text,
  estado text,
  created_at timestamp with time zone DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| CREATE TABLE public.v2_iniciativas_semaforo_log (
  id integer NOT NULL DEFAULT nextval('v2_iniciativas_semaforo_log_id_seq'::regclass),
  iniciativa_id integer NOT NULL,
  campo text NOT NULL,
  valor_anterior text,
  valor_nuevo text NOT NULL,
  cambiado_por text,
  created_at timestamp with time zone DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CREATE TABLE public.v2_ministerios (
  id integer NOT NULL DEFAULT nextval('v2_ministerios_id_seq'::regclass),
  nombre text NOT NULL
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| CREATE TABLE public.v2_minutas_log (
  id integer NOT NULL DEFAULT nextval('v2_minutas_log_id_seq'::regclass),
  region_id smallint NOT NULL,
  tipo text NOT NULL,
  generado_por text,
  generado_at timestamp with time zone NOT NULL DEFAULT now(),
  hash_pdf text,
  parametros jsonb,
  duracion_ms integer
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| CREATE TABLE public.v2_proyectos_inversion (
  id text NOT NULL,
  region_id smallint NOT NULL,
  sistema_origen text NOT NULL,
  nombre text NOT NULL,
  tipo text,
  estado text,
  titular text,
  servicio text,
  programa text,
  etapa text,
  inversion numeric,
  moneda text NOT NULL,
  fecha_presentacion date,
  url_ficha text,
  descripcion text,
  synced_at timestamp with time zone DEFAULT now()
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| CREATE TABLE public.v2_regiones (
  id smallint NOT NULL,
  cod text NOT NULL,
  nombre text NOT NULL,
  capital text,
  zona text
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| CREATE TABLE public.v2_seguridad_semanal (
  id integer NOT NULL DEFAULT nextval('v2_seguridad_semanal_id_seq'::regclass),
  region_id smallint NOT NULL,
  semana_iso text NOT NULL,
  fecha_desde date,
  fecha_hasta date,
  tasa_registro numeric,
  casos_total integer,
  casos_ultima_semana integer,
  casos_28dias integer,
  casos_anno_fecha integer,
  var_ultima_semana numeric,
  var_28dias numeric,
  var_anno_fecha numeric,
  mayor_registro_1 text,
  pct_1 numeric,
  mayor_registro_2 text,
  pct_2 numeric,
  mayor_registro_3 text,
  pct_3 numeric,
  mayor_registro_4 text,
  pct_4 numeric,
  mayor_registro_5 text,
  pct_5 numeric,
  controles_total integer,
  controles_identidad integer,
  controles_vehicular integer,
  fiscalizaciones integer,
  incautaciones integer,
  incaut_fuego integer,
  incaut_blancas integer,
  allanamientos_anno integer,
  vehiculos_rec_anno integer,
  decomisos_anno numeric
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |


-- =============================================================================
-- INDEXES (incluye PK y UNIQUE)
-- =============================================================================

-- | ddl                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CREATE UNIQUE INDEX autoridades_regionales_pkey ON public.autoridades_regionales USING btree (id);                                                                     |
| CREATE UNIQUE INDEX desalojo_capas_pkey ON public.desalojo_capas USING btree (id);                                                                                     |
| CREATE INDEX idx_desalojo_capas_folio_minvu ON public.desalojo_capas USING btree (folio_minvu) WHERE (folio_minvu IS NOT NULL);                                        |
| CREATE INDEX idx_desalojo_capas_lookup ON public.desalojo_capas USING btree (prioridad_id, activa, orden);                                                             |
| CREATE UNIQUE INDEX desalojo_detalle_pkey ON public.desalojo_detalle USING btree (prioridad_id);                                                                       |
| CREATE UNIQUE INDEX desalojo_documentos_pkey ON public.desalojo_documentos USING btree (id);                                                                           |
| CREATE INDEX idx_desalojo_documentos_item ON public.desalojo_documentos USING btree (capa_id, fase, item_key) WHERE ((capa_id IS NOT NULL) AND (fase IS NOT NULL));    |
| CREATE INDEX idx_desalojo_documentos_lookup ON public.desalojo_documentos USING btree (prioridad_id, capa_id, created_at DESC);                                        |
| CREATE UNIQUE INDEX desalojo_fase_estado_capa_id_fase_key ON public.desalojo_fase_estado USING btree (capa_id, fase);                                                  |
| CREATE UNIQUE INDEX desalojo_fase_estado_pkey ON public.desalojo_fase_estado USING btree (id);                                                                         |
| CREATE INDEX idx_desalojo_fase_estado_lookup ON public.desalojo_fase_estado USING btree (prioridad_id, capa_id, fase);                                                 |
| CREATE UNIQUE INDEX desalojo_log_pkey ON public.desalojo_log USING btree (id);                                                                                         |
| CREATE INDEX idx_desalojo_log_lookup ON public.desalojo_log USING btree (prioridad_id, created_at DESC);                                                               |
| CREATE UNIQUE INDEX desalojo_seguimientos_pkey ON public.desalojo_seguimientos USING btree (id);                                                                       |
| CREATE INDEX idx_desalojo_seguimientos_capa ON public.desalojo_seguimientos USING btree (capa_id, created_at DESC);                                                    |
| CREATE INDEX idx_desalojo_seguimientos_lookup ON public.desalojo_seguimientos USING btree (prioridad_id, dimension, created_at DESC);                                  |
| CREATE UNIQUE INDEX documentos_prioridad_pkey ON public.documentos_prioridad USING btree (id);                                                                         |
| CREATE INDEX idx_import_log_proposal ON public.import_log USING btree (proposal_id) WHERE (proposal_id IS NOT NULL);                                                   |
| CREATE INDEX idx_import_log_run_at ON public.import_log USING btree (run_at DESC);                                                                                     |
| CREATE UNIQUE INDEX import_log_pkey ON public.import_log USING btree (id);                                                                                             |
| CREATE INDEX idx_import_proposals_pending ON public.import_proposals USING btree (status, created_at DESC) WHERE (status = 'pending'::text);                           |
| CREATE INDEX idx_import_proposals_proposer ON public.import_proposals USING btree (proposer_id, created_at DESC);                                                      |
| CREATE UNIQUE INDEX import_proposals_pkey ON public.import_proposals USING btree (id);                                                                                 |
| CREATE INDEX idx_metricas_eje_id ON public.metricas_eje USING btree (eje_id);                                                                                          |
| CREATE INDEX idx_metricas_eje_lookup ON public.metricas_eje USING btree (region_cod, eje, created_at DESC);                                                            |
| CREATE UNIQUE INDEX metricas_eje_pkey ON public.metricas_eje USING btree (id);                                                                                         |
| CREATE UNIQUE INDEX minuta_cache_pkey ON public.minuta_cache USING btree (region_cod, tipo, cache_date);                                                               |
| CREATE INDEX idx_mop_etapa ON public.mop_projects USING btree (etapa);                                                                                                 |
| CREATE INDEX idx_mop_region ON public.mop_projects USING btree (region_id);                                                                                            |
| CREATE UNIQUE INDEX mop_projects_pkey ON public.mop_projects USING btree (cod_p);                                                                                      |
| CREATE UNIQUE INDEX planes_regionales_pkey ON public.planes_regionales USING btree (region_cod);                                                                       |
| CREATE UNIQUE INDEX prego_monitoreo_pkey ON public.prego_monitoreo USING btree (region_cod);                                                                           |
| CREATE INDEX idx_prioridades_cod ON public.prioridades_territoriales USING btree (cod);                                                                                |
| CREATE INDEX idx_prioridades_eje_id ON public.prioridades_territoriales USING btree (eje_id);                                                                          |
| CREATE INDEX idx_prioridades_en_foco ON public.prioridades_territoriales USING btree (en_foco) WHERE (en_foco = true);                                                 |
| CREATE INDEX idx_prioridades_es_desalojo ON public.prioridades_territoriales USING btree (es_desalojo) WHERE (es_desalojo = true);                                     |
| CREATE INDEX idx_prioridades_tags ON public.prioridades_territoriales USING gin (tags);                                                                                |
| CREATE UNIQUE INDEX prioridades_territoriales_pkey ON public.prioridades_territoriales USING btree (id);                                                               |
| CREATE INDEX idx_region_ejes_region ON public.region_ejes USING btree (region_cod, numero);                                                                            |
| CREATE UNIQUE INDEX region_ejes_pkey ON public.region_ejes USING btree (id);                                                                                           |
| CREATE UNIQUE INDEX region_ejes_region_cod_numero_key ON public.region_ejes USING btree (region_cod, numero);                                                          |
| CREATE UNIQUE INDEX region_metrics_pkey ON public.region_metrics USING btree (region_cod);                                                                             |
| CREATE INDEX idx_rm_period ON public.regional_metrics USING btree (period DESC);                                                                                       |
| CREATE INDEX idx_rm_region_metric ON public.regional_metrics USING btree (region_id, metric_name);                                                                     |
| CREATE UNIQUE INDEX regional_metrics_pkey ON public.regional_metrics USING btree (id);                                                                                 |
| CREATE UNIQUE INDEX uq_regional_metrics ON public.regional_metrics USING btree (region_id, metric_name, period);                                                       |
| CREATE UNIQUE INDEX security_weekly_pkey ON public.security_weekly USING btree (id);                                                                                   |
| CREATE UNIQUE INDEX security_weekly_region_id_fecha_hasta_key ON public.security_weekly USING btree (region_id, fecha_hasta);                                          |
| CREATE UNIQUE INDEX seguimientos_pkey ON public.seguimientos USING btree (id);                                                                                         |
| CREATE INDEX idx_seia_fecha ON public.seia_projects USING btree (fecha_presentacion DESC);                                                                             |
| CREATE INDEX idx_seia_region ON public.seia_projects USING btree (region_id);                                                                                          |
| CREATE UNIQUE INDEX seia_projects_pkey ON public.seia_projects USING btree (id);                                                                                       |
| CREATE UNIQUE INDEX semaforo_log_pkey ON public.semaforo_log USING btree (id);                                                                                         |
| CREATE UNIQUE INDEX stop_stats_pkey ON public.stop_stats USING btree (region_id, semana_id);                                                                           |
| CREATE UNIQUE INDEX sync_status_pkey ON public.sync_status USING btree (name);                                                                                         |
| CREATE UNIQUE INDEX user_profiles_pkey ON public.user_profiles USING btree (id);                                                                                       |
| CREATE UNIQUE INDEX v2_ejes_estrategicos_codigo_key ON public.v2_ejes_estrategicos USING btree (codigo);                                                               |
| CREATE UNIQUE INDEX v2_ejes_estrategicos_pkey ON public.v2_ejes_estrategicos USING btree (id);                                                                         |
| CREATE UNIQUE INDEX v2_fuentes_codigo_key ON public.v2_fuentes USING btree (codigo);                                                                                   |
| CREATE UNIQUE INDEX v2_fuentes_pkey ON public.v2_fuentes USING btree (id);                                                                                             |
| CREATE UNIQUE INDEX v2_indicadores_catalogo_pkey ON public.v2_indicadores_catalogo USING btree (codigo);                                                               |
| CREATE UNIQUE INDEX v2_indicadores_pipeline_pkey ON public.v2_indicadores_pipeline USING btree (id);                                                                   |
| CREATE UNIQUE INDEX v2_indicadores_pipeline_log_pkey ON public.v2_indicadores_pipeline_log USING btree (id);                                                           |
| CREATE UNIQUE INDEX idx_v2_ultimo_lookup ON public.v2_indicadores_ultimo USING btree (codigo_indicador, region_id);                                                    |
| CREATE INDEX idx_v2_valores_lookup ON public.v2_indicadores_valores USING btree (codigo_indicador, region_id, periodo DESC);                                           |
| CREATE INDEX idx_v2_valores_region ON public.v2_indicadores_valores USING btree (region_id, codigo_indicador);                                                         |
| CREATE UNIQUE INDEX v2_indicadores_valores_codigo_indicador_region_id_periodo_key ON public.v2_indicadores_valores USING btree (codigo_indicador, region_id, periodo); |
| CREATE UNIQUE INDEX v2_indicadores_valores_pkey ON public.v2_indicadores_valores USING btree (id);                                                                     |
| CREATE INDEX idx_v2_iniciativas_region ON public.v2_iniciativas USING btree (region_id);                                                                               |
| CREATE UNIQUE INDEX v2_iniciativas_pkey ON public.v2_iniciativas USING btree (id);                                                                                     |
| CREATE UNIQUE INDEX v2_iniciativas_documentos_pkey ON public.v2_iniciativas_documentos USING btree (id);                                                               |
| CREATE UNIQUE INDEX v2_iniciativas_seguimiento_pkey ON public.v2_iniciativas_seguimiento USING btree (id);                                                             |
| CREATE UNIQUE INDEX v2_iniciativas_semaforo_log_pkey ON public.v2_iniciativas_semaforo_log USING btree (id);                                                           |
| CREATE UNIQUE INDEX v2_ministerios_nombre_key ON public.v2_ministerios USING btree (nombre);                                                                           |
| CREATE UNIQUE INDEX v2_ministerios_pkey ON public.v2_ministerios USING btree (id);                                                                                     |
| CREATE UNIQUE INDEX v2_minutas_log_pkey ON public.v2_minutas_log USING btree (id);                                                                                     |
| CREATE INDEX idx_v2_proyectos_region ON public.v2_proyectos_inversion USING btree (region_id);                                                                         |
| CREATE UNIQUE INDEX v2_proyectos_inversion_pkey ON public.v2_proyectos_inversion USING btree (id);                                                                     |
| CREATE UNIQUE INDEX v2_regiones_cod_key ON public.v2_regiones USING btree (cod);                                                                                       |
| CREATE UNIQUE INDEX v2_regiones_pkey ON public.v2_regiones USING btree (id);                                                                                           |
| CREATE UNIQUE INDEX v2_seguridad_semanal_pkey ON public.v2_seguridad_semanal USING btree (id);                                                                         |
| CREATE UNIQUE INDEX v2_seguridad_semanal_region_id_semana_iso_key ON public.v2_seguridad_semanal USING btree (region_id, semana_iso);                                  |


-- =============================================================================
-- POLICIES (RLS)
-- =============================================================================
-- DDL reconstruido de pg_policies. Es la matriz de seguridad VIGENTE antes de
-- Etapa 2 (RLS por rol).

-- | ddl                                                                       |
| ------------------------------------------------------------------------- |
| ALTER TABLE public.autoridades_regionales ENABLE ROW LEVEL SECURITY;      |
| ALTER TABLE public.desalojo_capas ENABLE ROW LEVEL SECURITY;              |
| ALTER TABLE public.desalojo_detalle ENABLE ROW LEVEL SECURITY;            |
| ALTER TABLE public.desalojo_documentos ENABLE ROW LEVEL SECURITY;         |
| ALTER TABLE public.desalojo_fase_estado ENABLE ROW LEVEL SECURITY;        |
| ALTER TABLE public.desalojo_log ENABLE ROW LEVEL SECURITY;                |
| ALTER TABLE public.desalojo_seguimientos ENABLE ROW LEVEL SECURITY;       |
| ALTER TABLE public.documentos_prioridad ENABLE ROW LEVEL SECURITY;        |
| ALTER TABLE public.import_log ENABLE ROW LEVEL SECURITY;                  |
| ALTER TABLE public.import_proposals ENABLE ROW LEVEL SECURITY;            |
| ALTER TABLE public.metricas_eje ENABLE ROW LEVEL SECURITY;                |
| ALTER TABLE public.minuta_cache ENABLE ROW LEVEL SECURITY;                |
| ALTER TABLE public.mop_projects ENABLE ROW LEVEL SECURITY;                |
| ALTER TABLE public.planes_regionales ENABLE ROW LEVEL SECURITY;           |
| ALTER TABLE public.prego_monitoreo ENABLE ROW LEVEL SECURITY;             |
| ALTER TABLE public.prioridades_territoriales ENABLE ROW LEVEL SECURITY;   |
| ALTER TABLE public.region_ejes ENABLE ROW LEVEL SECURITY;                 |
| ALTER TABLE public.region_metrics ENABLE ROW LEVEL SECURITY;              |
| ALTER TABLE public.regional_metrics ENABLE ROW LEVEL SECURITY;            |
| ALTER TABLE public.security_weekly ENABLE ROW LEVEL SECURITY;             |
| ALTER TABLE public.seguimientos ENABLE ROW LEVEL SECURITY;                |
| ALTER TABLE public.seia_projects ENABLE ROW LEVEL SECURITY;               |
| ALTER TABLE public.semaforo_log ENABLE ROW LEVEL SECURITY;                |
| ALTER TABLE public.stop_stats ENABLE ROW LEVEL SECURITY;                  |
| ALTER TABLE public.sync_status ENABLE ROW LEVEL SECURITY;                 |
| ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;               |
| ALTER TABLE public.v2_ejes_estrategicos ENABLE ROW LEVEL SECURITY;        |
| ALTER TABLE public.v2_fuentes ENABLE ROW LEVEL SECURITY;                  |
| ALTER TABLE public.v2_indicadores_catalogo ENABLE ROW LEVEL SECURITY;     |
| ALTER TABLE public.v2_indicadores_pipeline ENABLE ROW LEVEL SECURITY;     |
| ALTER TABLE public.v2_indicadores_pipeline_log ENABLE ROW LEVEL SECURITY; |
| ALTER TABLE public.v2_indicadores_valores ENABLE ROW LEVEL SECURITY;      |
| ALTER TABLE public.v2_iniciativas ENABLE ROW LEVEL SECURITY;              |
| ALTER TABLE public.v2_iniciativas_documentos ENABLE ROW LEVEL SECURITY;   |
| ALTER TABLE public.v2_iniciativas_seguimiento ENABLE ROW LEVEL SECURITY;  |
| ALTER TABLE public.v2_iniciativas_semaforo_log ENABLE ROW LEVEL SECURITY; |
| ALTER TABLE public.v2_ministerios ENABLE ROW LEVEL SECURITY;              |
| ALTER TABLE public.v2_minutas_log ENABLE ROW LEVEL SECURITY;              |
| ALTER TABLE public.v2_proyectos_inversion ENABLE ROW LEVEL SECURITY;      |
| ALTER TABLE public.v2_regiones ENABLE ROW LEVEL SECURITY;                 |
| ALTER TABLE public.v2_seguridad_semanal ENABLE ROW LEVEL SECURITY;        |


-- =============================================================================
-- FUNCTIONS (incluye SECURITY DEFINER / DEFINER)
-- =============================================================================

-- | ddl                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CREATE OR REPLACE FUNCTION public.cleanup_user_references(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
BEGIN
  -- 1. Liberar ownership de archivos en Supabase Storage
  UPDATE storage.objects
  SET owner = NULL
  WHERE owner = target_user_id;

  -- 2. Borrar el perfil
  DELETE FROM public.user_profiles
  WHERE id = target_user_id;
END;
$function$
; |
| CREATE OR REPLACE FUNCTION public.refresh_v2_indicadores_ultimo()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW v2_indicadores_ultimo;
END;
$function$
;                                                                                                                                                                                                                                   |


-- =============================================================================
-- VIEWS Y MATERIALIZED VIEWS
-- =============================================================================

-- | ddl                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CREATE MATERIALIZED VIEW public.v2_indicadores_ultimo AS
 SELECT DISTINCT ON (codigo_indicador, region_id) codigo_indicador,
    region_id,
    valor,
    periodo,
    calidad,
    fecha_carga_sistema
   FROM v2_indicadores_valores
  ORDER BY codigo_indicador, region_id, periodo DESC; |


-- =============================================================================
-- Queries para regenerar
-- =============================================================================
-- Pegar y correr en Supabase SQL Editor. El output va arriba en su sección.

/*

-- ---------- 1. CREATE TABLE de cada tabla ----------
-- Reconstruye DDL básico. Para mayor fidelidad, usar pg_dump si hay acceso.

SELECT
  'CREATE TABLE public.' || c.relname || ' (' || E'\n  ' ||
  string_agg(
    a.attname || ' ' ||
    pg_catalog.format_type(a.atttypid, a.atttypmod) ||
    CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END ||
    CASE WHEN ad.adbin IS NOT NULL
         THEN ' DEFAULT ' || pg_get_expr(ad.adbin, a.attrelid)
         ELSE '' END,
    E',\n  ' ORDER BY a.attnum
  ) || E'\n);' AS ddl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname
ORDER BY c.relname;


-- ---------- 2. INDEXES (incluye PK + UNIQUE) ----------

SELECT indexdef || ';' AS ddl
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;


-- ---------- 3. POLICIES (RLS) ----------
-- Reconstruye CREATE POLICY desde pg_policies.

SELECT
  'CREATE POLICY ' || quote_ident(policyname) || ' ON public.' || quote_ident(tablename) ||
  ' FOR ' || cmd ||
  CASE WHEN roles IS NOT NULL AND array_length(roles, 1) > 0
       THEN ' TO ' || array_to_string(roles, ', ')
       ELSE '' END ||
  CASE WHEN qual IS NOT NULL
       THEN ' USING (' || qual || ')'
       ELSE '' END ||
  CASE WHEN with_check IS NOT NULL
       THEN ' WITH CHECK (' || with_check || ')'
       ELSE '' END ||
  ';' AS ddl
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- También útil: ALTER TABLE … ENABLE ROW LEVEL SECURITY
SELECT
  'ALTER TABLE public.' || relname || ' ENABLE ROW LEVEL SECURITY;' AS ddl
FROM pg_class
WHERE relkind = 'r'
  AND relnamespace = 'public'::regnamespace
  AND relrowsecurity = true
ORDER BY relname;


-- ---------- 4. FUNCTIONS ----------

SELECT pg_get_functiondef(p.oid) || ';' AS ddl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;


-- ---------- 5. VIEWS y MATERIALIZED VIEWS ----------

SELECT
  'CREATE VIEW public.' || viewname || ' AS' || E'\n' || definition AS ddl
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;

SELECT
  'CREATE MATERIALIZED VIEW public.' || matviewname || ' AS' || E'\n' || definition AS ddl
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY matviewname;

*/
