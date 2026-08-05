-- ============================================================================
-- 054_meta_empleo_foco_y_seed_regiones.sql
--
-- Carga la meta de empleo, el foco productivo y el cupo de subsidios
-- declarados para las 16 regiones (reemplaza el piloto de solo Tarapacá de
-- las migraciones 052/053). `foco_productivo` es texto libre — se muestra
-- justo debajo de la meta en Mesa Empleo, a modo de nube de texto.
-- ============================================================================

ALTER TABLE public.region_meta_empleo
  ADD COLUMN IF NOT EXISTS foco_productivo TEXT;

INSERT INTO public.region_meta_empleo (region_cod, objetivo, foco_productivo) VALUES
  ('XV',   700,   'Comercio fronterizo y servicios locales.'),
  ('I',    1000,  'Logística, comercio de zona franca y minería.'),
  ('II',   1500,  'Proveedores mineros y convenios con grandes mineras.'),
  ('III',  800,   'Pequeña y mediana minería, y energía renovable.'),
  ('IV',   1200,  'Construcción, agricultura y reactivación del turismo.'),
  ('V',    6500,  'Región prioritaria; foco en obras viales y puerto.'),
  ('RM',   16000, 'Lidera a nivel nacional; construcción y vivienda urbana.'),
  ('VI',   1400,  'Agroindustria y reactivación del empleo femenino.'),
  ('VII',  2200,  'Agroindustria, comercio y pymes madereras.'),
  ('XVI',  1800,  'Conectividad rural y apoyo a pymes agrícolas.'),
  ('VIII', 7500,  'Área crítica; foco en industria pesada y manufactura.'),
  ('IX',   4000,  'Foco social, obras públicas de vialidad y turismo.'),
  ('XIV',  1100,  'Sector forestal, ganadero y emprendimientos locales.'),
  ('X',    3000,  'Pesca artesanal, acuicultura y conectividad en Chiloé.'),
  ('XI',   600,   'Infraestructura pública y mantención de caminos locales.'),
  ('XII',  700,   'Logística antártica, energía y turismo de temporada.')
ON CONFLICT (region_cod) DO UPDATE SET
  objetivo = EXCLUDED.objetivo,
  foco_productivo = EXCLUDED.foco_productivo;

INSERT INTO public.region_subsidio_empleo (region_cod, cupos) VALUES
  ('RM',  9554),
  ('V',   2566),
  ('VIII', 1876),
  ('VII', 1538),
  ('VI',  1331),
  ('IX',  1130),
  ('IV',  1117),
  ('X',   875),
  ('II',  861),
  ('I',   842),
  ('XVI', 820),
  ('XIV', 694),
  ('III', 647),
  ('XV',  514),
  ('XII', 399),
  ('XI',  236)
ON CONFLICT (region_cod) DO UPDATE SET
  cupos = EXCLUDED.cupos;
