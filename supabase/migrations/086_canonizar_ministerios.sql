-- ════════════════════════════════════════════════════════════════════════════
-- 086 — Canoniza `prioridades_territoriales.ministerio` (limpieza de datos)
--
-- Contexto: el campo es TEXT libre multi-valor (separado por ';') y en prod
-- convive el nombre oficial con variantes sin tilde, abreviaturas y typos:
--   "Ministerio de Obras Publicas" (164 filas), "Minsterio de Obras Públicas",
--   "Min. Salud", "Ministerio de Educacion", "Ministerio de Medio Ambiente"
--   (vs "del"), "Ministerio de Transporte y..." (vs "Transportes"), etc.
-- Eso rompe cualquier match exacto por ministerio — en particular el scoping
-- del nuevo rol SEREMI (mig 087), que filtra la cartera por ministerio.
--
-- Esta migración reescribe SOLO las variantes inequívocas a su nombre oficial,
-- parte por parte del string multi-valor, preservando el orden y el separador.
--
-- NO SE TOCA a propósito:
--   - "Ministerio del Interior y Seguridad Pública" (519 filas): es el nombre
--     histórico del ministerio ANTES de dividirse en Interior y Seguridad
--     Pública. Diego confirmó que esas iniciativas están MAL CATEGORIZADAS
--     (son cuarteles de bomberos, comisarías, edificios consistoriales y
--     electrificación rural cargados en bloque en V/IV/IX/XI). Reasignarlas en
--     masa a Interior o a Seguridad metería un error nuevo: cada una necesita
--     recategorización real. Quedan como backlog de curaduría y, por lo tanto,
--     fuera del alcance de cualquier SEREMI (fail-closed) hasta corregirse.
--   - Entidades no ministeriales: SUBDERE, Municipalidad de *, Gobierno
--     Regional, Poder Judicial, Ministerio Público, Universidad de Atacama,
--     Servicio Nacional del Patrimonio Cultural, "Pendiente".
--
-- Reversible: se respalda (id, ministerio) en `_backup_ministerio_086` antes de
-- tocar nada. Rollback = UPDATE ... FROM _backup_ministerio_086.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Respaldo ────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public._backup_ministerio_086;
CREATE TABLE public._backup_ministerio_086 AS
  SELECT id, ministerio FROM public.prioridades_territoriales
  WHERE ministerio IS NOT NULL AND btrim(ministerio) <> '';

-- ── Canonización parte por parte ────────────────────────────────────────────
WITH mapa(variante, canon) AS (VALUES
  -- Obras Públicas
  ('ministerio de obras publicas',                      'Ministerio de Obras Públicas'),
  ('minsterio de obras públicas',                       'Ministerio de Obras Públicas'),
  ('min. obras publicas',                               'Ministerio de Obras Públicas'),
  -- Salud
  ('min. salud',                                        'Ministerio de Salud'),
  ('minsterio de salud',                                'Ministerio de Salud'),
  -- Educación
  ('ministerio de educacion',                           'Ministerio de Educación'),
  ('min. educación',                                    'Ministerio de Educación'),
  -- Interior (NO el combinado con Seguridad — ver cabecera)
  ('min. interior',                                     'Ministerio del Interior'),
  ('ministerio de interior',                            'Ministerio del Interior'),
  -- Seguridad Pública
  ('min. seguridad',                                    'Ministerio de Seguridad Pública'),
  -- Medio Ambiente
  ('ministerio de medio ambiente',                      'Ministerio del Medio Ambiente'),
  ('min. medio ambiente',                               'Ministerio del Medio Ambiente'),
  -- Transportes
  ('ministerio de transporte y telecomunicaciones',     'Ministerio de Transportes y Telecomunicaciones'),
  ('min. transportes',                                  'Ministerio de Transportes y Telecomunicaciones'),
  -- Desarrollo Social
  ('desarrollo social y familia',                       'Ministerio de Desarrollo Social y Familia'),
  ('min. desarrollo social',                            'Ministerio de Desarrollo Social y Familia'),
  -- Bienes Nacionales
  ('bienes nacionales',                                 'Ministerio de Bienes Nacionales'),
  ('min. bienes nacionales',                            'Ministerio de Bienes Nacionales'),
  ('minsiterio de bienes nacionales',                   'Ministerio de Bienes Nacionales'),
  -- Trabajo / Economía / Agricultura / Justicia / Hacienda / Energía / Ciencia
  ('min. trabajo',                                      'Ministerio del Trabajo y Previsión Social'),
  ('min. economía',                                     'Ministerio de Economía, Fomento y Turismo'),
  ('ministerio de economía, fomento y turismo (dop - mop)', 'Ministerio de Economía, Fomento y Turismo'),
  ('min. agricultura',                                  'Ministerio de Agricultura'),
  ('min. justicia',                                     'Ministerio de Justicia y Derechos Humanos'),
  ('min. hacienda',                                     'Ministerio de Hacienda'),
  ('misterio de energía',                               'Ministerio de Energía'),
  ('min. ciencia',                                      'Ministerio de Ciencia, Tecnología, Conocimiento e Innovación'),
  -- Mujer / SEGPRES / Deporte
  ('ministerio de la mujer y la equidad de género',     'Ministerio de la Mujer y Equidad de Género'),
  ('ministerio secretaria general de la presidencia',   'Ministerio Secretaría General de la Presidencia'),
  ('ministerio del deporte (minvu)',                    'Ministerio del Deporte')
),
recompuesto AS (
  SELECT p.id,
         string_agg(COALESCE(m.canon, btrim(t.parte)), ';' ORDER BY t.ord) AS nuevo
  FROM public.prioridades_territoriales p,
       LATERAL unnest(string_to_array(p.ministerio, ';')) WITH ORDINALITY AS t(parte, ord)
  LEFT JOIN mapa m ON m.variante = lower(btrim(t.parte))
  WHERE p.ministerio IS NOT NULL AND btrim(p.ministerio) <> ''
  GROUP BY p.id
)
UPDATE public.prioridades_territoriales p
SET ministerio = r.nuevo
FROM recompuesto r
WHERE p.id = r.id
  AND p.ministerio IS DISTINCT FROM r.nuevo;

COMMIT;

-- Verificación sugerida (debe devolver 0 filas para las variantes mapeadas):
--   SELECT DISTINCT btrim(parte) FROM prioridades_territoriales p,
--     LATERAL unnest(string_to_array(p.ministerio,';')) parte
--   WHERE lower(btrim(parte)) IN ('ministerio de obras publicas','min. salud',
--     'ministerio de educacion','ministerio de medio ambiente');
