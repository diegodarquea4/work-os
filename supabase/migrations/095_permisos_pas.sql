-- ============================================================================
-- 095_permisos_pas.sql
--
-- Módulo de Permisos (PAS — Permisos Ambientales Sectoriales) para la ficha
-- de proyectos privados del Comité Económico:
--   · `pas_catalogo` — catálogo GLOBAL de referencia (no region-scoped),
--     precargado con los 50 PAS 111-160 del usuario, crece cuando alguien
--     escribe uno nuevo al asociarlo a un proyecto (mismo espíritu que
--     `oaeca`, mig 051: catálogo autoincremental, RLS abierta a
--     cualquier no-viewer).
--   · `comite_economico_proyecto_permiso` — QUÉ permiso del catálogo
--     necesita CADA proyecto, con su propio estado tri-color
--     (pendiente/otorgado/frenado; NULL = sin estado, default al crear).
--   · `comite_economico_proyecto_seguimiento.permiso_id` — un avance puede
--     asociarse a uno de los permisos del proyecto (o ser general, NULL).
--   · `user_profiles.ministerio` — para filtrar avances por el ministerio
--     del autor. OJO: esto se escribió antes de que la mig 087 (rol SEREMI)
--     creara la MISMA columna, que además la usa para ACOTAR el acceso vía
--     `current_user_sees_ministerio()`. El ALTER de acá quedó idempotente y
--     sin efecto, y la columna hoy la gobierna la 087: solo se puebla para
--     el rol `seremi`, porque un valor no nulo en cualquier otro rol le
--     achica la cartera que ese usuario ve. Decisión tomada: se deja así —
--     los avances los cargan principalmente los SEREMI, así que el filtro
--     por ministerio separa a quienes importa y no se abre una segunda
--     columna de "ministerio de pertenencia" sin efecto en la RLS.
-- ============================================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS ministerio TEXT;

-- ── Catálogo global de PAS ───────────────────────────────────────────────────

CREATE TABLE public.pas_catalogo (
  id BIGSERIAL PRIMARY KEY,
  n_pas TEXT NOT NULL UNIQUE,
  sector_materia TEXT,
  nombre TEXT NOT NULL,
  organo_otorgante TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT
);

ALTER TABLE public.pas_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY pas_catalogo_select ON public.pas_catalogo
  FOR SELECT TO authenticated
  USING (public.current_user_role() <> 'viewer');

CREATE POLICY pas_catalogo_insert ON public.pas_catalogo
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() <> 'viewer');

INSERT INTO public.pas_catalogo (n_pas, sector_materia, nombre, organo_otorgante) VALUES
  ('PAS 111', 'Contaminación acuática / marítimo', 'Vertimiento en aguas sometidas a jurisdicción nacional desde naves, aeronaves, artefactos navales, construcciones y obras portuarias', 'DIRECTEMAR (Autoridad Marítima)'),
  ('PAS 112', 'Contaminación acuática / marítimo', 'Emplazamiento de instalaciones terrestres de recepción de mezclas oleosas en puertos y terminales', 'DIRECTEMAR (Autoridad Marítima)'),
  ('PAS 113', 'Contaminación acuática / marítimo', 'Instalación de plantas de tratamiento de instalaciones terrestres de recepción de mezclas oleosas con descarga a aguas de jurisdicción nacional', 'DIRECTEMAR (Autoridad Marítima)'),
  ('PAS 114', 'Contaminación acuática / marítimo', 'Instalación de terminal marítimo y cañerías conductoras para transporte de sustancias contaminantes', 'DIRECTEMAR (Autoridad Marítima)'),
  ('PAS 115', 'Contaminación acuática / marítimo', 'Introducir o descargar materias, energía o sustancias nocivas o peligrosas a aguas sometidas a jurisdicción nacional', 'DIRECTEMAR (Autoridad Marítima)'),
  ('PAS 116', 'Pesca y acuicultura', 'Realizar actividades de acuicultura', 'Subsecretaría de Pesca y Acuicultura (SUBPESCA)'),
  ('PAS 117', 'Pesca y acuicultura', 'Autorización para repoblación y siembra de especies hidrobiológicas con fines de pesca recreativa', 'Subsecretaría de Pesca y Acuicultura (SUBPESCA)'),
  ('PAS 118', 'Pesca y acuicultura', 'Actividades de acuicultura en áreas de manejo y explotación de recursos bentónicos (AMERB)', 'Subsecretaría de Pesca y Acuicultura (SUBPESCA)'),
  ('PAS 119', 'Pesca y acuicultura', 'Pesca de investigación (seguimiento de poblaciones de especies hidrobiológicas)', 'Subsecretaría de Pesca y Acuicultura (SUBPESCA)'),
  ('PAS 120', 'Patrimonio / áreas protegidas', 'Trabajos de construcción, excavación o actividades que alteren el estado natural de un Santuario de la Naturaleza', 'Consejo de Monumentos Nacionales (CMN)'),
  ('PAS 121', 'Minería / áreas protegidas', 'Labores mineras en parques nacionales, reservas nacionales o monumentos naturales', 'Delegado Presidencial Regional (ex Intendente) — verificar en guía SEA'),
  ('PAS 122', 'Minería / patrimonio', 'Labores mineras en covaderas o lugares declarados de interés histórico o científico', 'Presidente de la República (a través del Min. de Minería) — verificar en guía SEA'),
  ('PAS 123', 'Fauna silvestre', 'Introducción en el medio natural de fauna silvestre (país o aclimatada), semen, embriones, huevos o larvas en áreas donde no tengan presencia', 'Servicio Agrícola y Ganadero (SAG)'),
  ('PAS 124', 'Fauna silvestre', 'Caza o captura de especies protegidas para controlar animales que causen graves perjuicios al ecosistema', 'Servicio Agrícola y Ganadero (SAG)'),
  ('PAS 125', 'Minería / salud', 'Labores mineras en sitios donde se han alumbrado aguas subterráneas o cuya explotación pueda afectar caudal o calidad del agua', 'SEREMI de Salud'),
  ('PAS 126', 'Salud / residuos', 'Construcción, reparación, modificación y ampliación de instalaciones para manejo de lodos de plantas de tratamiento de aguas servidas', 'SEREMI de Salud'),
  ('PAS 127', 'Forestal / especies protegidas', 'Corta y destrucción del Alerce', 'Corporación Nacional Forestal (CONAF)'),
  ('PAS 128', 'Forestal / especies protegidas', 'Corta o explotación de araucarias vivas', 'Corporación Nacional Forestal (CONAF)'),
  ('PAS 129', 'Forestal / especies protegidas', 'Corta o explotación de Queule, Pitao, Belloto del Sur, Ruil y Belloto del Norte', 'Corporación Nacional Forestal (CONAF)'),
  ('PAS 130', 'Aguas', 'Nuevas explotaciones o mayores extracciones de aguas subterráneas en zonas de prohibición (acuíferos de vegas y bofedales) en Arica y Parinacota, Tarapacá y Antofagasta', 'Dirección General de Aguas (DGA)'),
  ('PAS 131', 'Patrimonio cultural', 'Intervención de Monumentos Históricos (conservación, reparación, restauración, remoción de objetos, destrucción/transformación, construcciones en alrededores, excavar o edificar en sitio eriazo)', 'Consejo de Monumentos Nacionales (CMN)'),
  ('PAS 132', 'Patrimonio cultural', 'Excavaciones de tipo arqueológico, antropológico y paleontológico', 'Consejo de Monumentos Nacionales (CMN)'),
  ('PAS 133', 'Patrimonio cultural', 'Construcciones nuevas, reconstrucción o mera conservación en zona típica o pintoresca', 'Consejo de Monumentos Nacionales (CMN)'),
  ('PAS 134', 'Seguridad nuclear', 'Emplazamiento de instalaciones nucleares y radiactivas', 'Comisión Chilena de Energía Nuclear (CCHEN)'),
  ('PAS 135', 'Minería', 'Construcción y operación de depósitos de relaves', 'SERNAGEOMIN'),
  ('PAS 136', 'Minería', 'Establecer botadero de estériles o acumulación de mineral', 'SERNAGEOMIN'),
  ('PAS 137', 'Minería', 'Aprobación del plan de cierre de una faena minera', 'SERNAGEOMIN'),
  ('PAS 138', 'Salud / saneamiento', 'Construcción, reparación, modificación y ampliación de obras de evacuación, tratamiento o disposición final de desagües y aguas servidas', 'SEREMI de Salud'),
  ('PAS 139', 'Salud / saneamiento', 'Construcción, reparación, modificación y ampliación de obras de evacuación, tratamiento o disposición final de residuos industriales o mineros', 'SEREMI de Salud'),
  ('PAS 140', 'Salud / residuos', 'Plantas de tratamiento de basuras y desperdicios, o lugares de acumulación, selección, industrialización, comercio o disposición final de basuras', 'SEREMI de Salud'),
  ('PAS 141', 'Salud / residuos', 'Construcción, reparación, modificación y ampliación de relleno sanitario', 'SEREMI de Salud'),
  ('PAS 142', 'Salud / residuos peligrosos', 'Sitio destinado al almacenamiento de residuos peligrosos', 'SEREMI de Salud'),
  ('PAS 143', 'Salud / residuos peligrosos', 'Transporte e instalaciones para la operación del sistema de transporte de residuos peligrosos', 'SEREMI de Salud'),
  ('PAS 144', 'Salud / residuos peligrosos', 'Instalaciones de eliminación de residuos peligrosos', 'SEREMI de Salud'),
  ('PAS 145', 'Salud / residuos peligrosos', 'Sitio de reciclaje de residuos peligrosos', 'SEREMI de Salud'),
  ('PAS 146', 'Fauna silvestre', 'Caza o captura de especies protegidas para investigación, centros de reproducción o criaderos, y utilización sustentable', 'Servicio Agrícola y Ganadero (SAG)'),
  ('PAS 147', 'Fauna silvestre', 'Recolección de huevos y crías con fines científicos o de reproducción', 'Servicio Agrícola y Ganadero (SAG)'),
  ('PAS 148', 'Forestal', 'Corta de bosque nativo', 'Corporación Nacional Forestal (CONAF)'),
  ('PAS 149', 'Forestal', 'Corta de plantaciones en terrenos de aptitud preferentemente forestal', 'Corporación Nacional Forestal (CONAF)'),
  ('PAS 150', 'Forestal / especies protegidas', 'Intervención de especies vegetales nativas clasificadas (art. 37 Ley 19.300) que formen parte de un bosque nativo, o alteración de su hábitat', 'Corporación Nacional Forestal (CONAF)'),
  ('PAS 151', 'Forestal', 'Corta, destrucción o descepado de formaciones xerofíticas', 'Corporación Nacional Forestal (CONAF)'),
  ('PAS 152', 'Forestal', 'Manejo de bosque nativo de preservación (ambientes únicos o representativos de la diversidad biológica)', 'Corporación Nacional Forestal (CONAF)'),
  ('PAS 153', 'Forestal', 'Corta de árboles y/o arbustos aislados en áreas declaradas de protección', 'Corporación Nacional Forestal (CONAF)'),
  ('PAS 154', 'Aguas', 'Exploraciones en terrenos que alimenten vegas o bofedales en Arica y Parinacota, Tarapacá y Antofagasta', 'Dirección General de Aguas (DGA)'),
  ('PAS 155', 'Aguas', 'Construcción de ciertas obras hidráulicas', 'Dirección General de Aguas (DGA)'),
  ('PAS 156', 'Aguas', 'Modificaciones de cauce', 'Dirección General de Aguas (DGA)'),
  ('PAS 157', 'Aguas', 'Obras de regularización o defensa de cauces naturales', 'Dirección General de Aguas (DGA)'),
  ('PAS 158', 'Aguas', 'Obras para la recarga artificial de acuíferos', 'Dirección General de Aguas (DGA)'),
  ('PAS 159', 'Aguas / áridos', 'Extracción de ripio y arena en cauces de ríos y esteros', 'Municipalidad respectiva, previo informe de la Dirección de Obras Hidráulicas (MOP) — verificar en guía SEA'),
  ('PAS 160', 'Urbanismo / suelo rural', 'Subdividir y urbanizar terrenos rurales o construcciones fuera de los límites urbanos', 'SEREMI de Agricultura (con informe SAG) y SEREMI MINVU (informe favorable)')
ON CONFLICT (n_pas) DO NOTHING;

-- ── Permiso por proyecto — qué permisos del catálogo necesita cada proyecto ──

CREATE TABLE public.comite_economico_proyecto_permiso (
  id BIGSERIAL PRIMARY KEY,
  proyecto_id BIGINT NOT NULL REFERENCES public.comite_economico_proyecto(id) ON DELETE CASCADE,
  pas_id BIGINT NOT NULL REFERENCES public.pas_catalogo(id),
  estado TEXT CHECK (estado IN ('pendiente', 'otorgado', 'frenado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT,
  UNIQUE (proyecto_id, pas_id)
);

CREATE INDEX idx_cep_permiso_proyecto ON public.comite_economico_proyecto_permiso (proyecto_id);

ALTER TABLE public.comite_economico_proyecto_permiso ENABLE ROW LEVEL SECURITY;

CREATE POLICY cep_permiso_select ON public.comite_economico_proyecto_permiso
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.comite_economico_proyecto p
    WHERE p.id = comite_economico_proyecto_permiso.proyecto_id
      AND public.current_user_sees_region(p.region_cod)));

CREATE POLICY cep_permiso_insert ON public.comite_economico_proyecto_permiso
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.comite_economico_proyecto p
    WHERE p.id = comite_economico_proyecto_permiso.proyecto_id
      AND public.current_user_can('comite.economico.operar', p.region_cod)));

CREATE POLICY cep_permiso_update ON public.comite_economico_proyecto_permiso
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.comite_economico_proyecto p
    WHERE p.id = comite_economico_proyecto_permiso.proyecto_id
      AND public.current_user_can('comite.economico.operar', p.region_cod)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.comite_economico_proyecto p
    WHERE p.id = comite_economico_proyecto_permiso.proyecto_id
      AND public.current_user_can('comite.economico.operar', p.region_cod)));

CREATE POLICY cep_permiso_delete ON public.comite_economico_proyecto_permiso
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.comite_economico_proyecto p
    WHERE p.id = comite_economico_proyecto_permiso.proyecto_id
      AND public.current_user_can('comite.economico.operar', p.region_cod)));

-- ── Avances — vínculo opcional a un permiso del proyecto ─────────────────────

ALTER TABLE public.comite_economico_proyecto_seguimiento
  ADD COLUMN IF NOT EXISTS permiso_id BIGINT REFERENCES public.comite_economico_proyecto_permiso(id);
