-- 121_oficios_seia_scraper.sql
--
-- Lo que el scraper necesita para escribir en `sesion_oficios_tratados` sin
-- pisarse con la importación por Excel ni consigo mismo.
--
-- ── El problema de la llave ─────────────────────────────────────────────────
--
-- La mig 118 dejó como llave natural (id_documento, organismo, región): un
-- oficio del SEA va a varios organismos con un solo documento, y lo que está
-- pendiente es que UNO no respondió.
--
-- Eso sigue valiendo para el 98% de los casos. Pero el 2% de las solicitudes
-- se publica SIN enlace al documento —se midió: 2 de 98 en 20 expedientes— y
-- ahí no hay `id_documento`. Con la llave actual, esas filas entrarían de nuevo
-- en cada corrida porque en Postgres dos NULL no son iguales.
--
-- ── La solución ─────────────────────────────────────────────────────────────
--
-- `seia_doc_n` es el número de orden del documento DENTRO del expediente, que
-- el SEIA muestra en su tabla y no cambia. Se guarda SOLO cuando falta
-- `id_documento`: así las filas con documento conservan exactamente la llave de
-- la mig 118 —y una fila del Excel y una del scraper del mismo oficio siguen
-- siendo la misma— y las otras se distinguen por expediente + número.
--
-- Idempotente.

ALTER TABLE public.sesion_oficios_tratados
  ADD COLUMN IF NOT EXISTS seia_doc_n SMALLINT;

COMMENT ON COLUMN public.sesion_oficios_tratados.seia_doc_n IS
  'Número de orden del documento dentro del expediente del SEIA. Se llena SOLO '
  'cuando el documento se publicó sin enlace y por lo tanto sin id_documento '
  '(~2% de las solicitudes). Sirve de llave natural de reemplazo; con '
  'id_documento presente va NULL, para no romper la llave de la mig 118.';

-- La llave de la 118, extendida por el caso sin documento. Cuando
-- `id_documento` existe, `seia_doc_n` es NULL y el COALESCE la deja idéntica a
-- la anterior: una fila del Excel y una del scraper del mismo oficio siguen
-- colisionando, que es justo lo que se quiere.
DROP INDEX IF EXISTS public.uq_sesion_oficios_documento_organismo;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sesion_oficios_documento_organismo
  ON public.sesion_oficios_tratados (
    COALESCE(id_documento, 0),
    COALESCE(id_expediente, 0),
    COALESCE(seia_doc_n, 0),
    COALESCE(oaeca_sea, oaeca_nombre, ''),
    region_cod
  )
  WHERE automatico;

-- ── El plazo es calculado, no publicado ─────────────────────────────────────
--
-- El SEIA NO publica la fecha límite por organismo: su pestaña «Plazos» es del
-- proyecto y se declara «solamente referencial». El scraper la calcula con la
-- regla observada en los 568 oficios del Excel (plazo legal + 1 día hábil, sin
-- descontar feriados), así que puede errar por uno o dos días.
--
-- Decirlo en la fila importa: quien ve «3 días de atraso» tiene que saber si
-- eso lo afirma el SEA o lo dedujo el panel. Cuando llega el Excel —que sí
-- trae la fecha oficial— la importación la pisa y baja la marca.
ALTER TABLE public.sesion_oficios_tratados
  ADD COLUMN IF NOT EXISTS plazo_estimado BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.sesion_oficios_tratados.plazo_estimado IS
  'true = fecha_limite la calculó el scraper, no la publicó el SEIA. El Excel de '
  'seia-abierto.cl sí trae la oficial: al importarlo, la pisa y esto vuelve a false.';

-- El scraper recorre expediente por expediente y pregunta qué tiene guardado
-- de cada uno.
CREATE INDEX IF NOT EXISTS idx_sesion_oficios_expediente
  ON public.sesion_oficios_tratados (id_expediente)
  WHERE automatico;

-- Sin RLS nueva: son columnas de una tabla ya gateada, y el scraper escribe
-- con service role desde la ruta, igual que la importación.
