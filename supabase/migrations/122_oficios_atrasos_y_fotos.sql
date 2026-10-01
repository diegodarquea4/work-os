-- 122_oficios_atrasos_y_fotos.sql
--
-- Para poder decir QUÉ ORGANISMOS SE ATRASAN Y CUÁNTO, que hoy no se puede.
--
-- ── Por qué hoy no se puede ─────────────────────────────────────────────────
--
-- La base guarda el estado de HOY. Un oficio pendiente sabe su fecha límite, y
-- de ahí sale su atraso actual; pero cuando el organismo responde, la fila pasa
-- a `resuelto` y el atraso que tuvo desaparece. Se midió el 2026-09-30: de los
-- 41 oficios que alguna vez figuraron atrasados quedaban rastros de 14, y el
-- promedio que salía —566 días— estaba contaminado por 27 expedientes muertos
-- de 2023 y 2024 que promediaban 855 días. Los atrasos reales eran de 8,4.
--
-- O sea: el número que se podía mostrar era falso por un factor de 67.
--
-- Esta migración agrega las dos cosas que faltan, y son de naturaleza distinta.
--
-- ══ 1. Congelar el atraso al cerrar (dos columnas) ══════════════════════════
--
-- El atraso de un oficio cerrado es un HECHO de un instante: cuántos días tarde
-- llegó la respuesta. Se calcula una vez, cuando se cierra, y no se recalcula
-- nunca — recalcularlo contra `now()` haría que un oficio respondido hace un año
-- «siga atrasándose», que es exactamente el bug de los 855 días.

ALTER TABLE public.sesion_oficios_tratados
  ADD COLUMN IF NOT EXISTS dias_atraso_al_cerrar SMALLINT;

COMMENT ON COLUMN public.sesion_oficios_tratados.dias_atraso_al_cerrar IS
  'Días entre fecha_limite y el momento en que el oficio dejó de estar pendiente. '
  'Positivo = se respondió tarde; 0 o negativo = a tiempo. Se calcula UNA vez al '
  'cerrar y no se recalcula: contra now() un oficio viejo seguiría atrasándose. '
  'NULL = se cerró antes de la mig 122, o no tenía fecha límite.';

-- El motivo es lo que separa un atraso de un expediente abandonado, y sin él
-- el promedio no se puede mostrar en una mesa.
--
--   respondio          el SEIA dejó de listar el oficio → el organismo contestó.
--                      CUENTA como atraso.
--   expediente_cerrado hay RCA, término anticipado o desistimiento: el oficio
--                      no se responde nunca más porque el proyecto se murió.
--                      NO cuenta — culpar al organismo sería injusto y falso.
--   cerrado_a_mano     alguien lo marcó resuelto en una sesión. CUENTA: quien
--                      conduce vio la respuesta antes que el scraper.
--
-- TEXT con CHECK y no un enum de Postgres: agregar un motivo nuevo a un enum
-- exige ALTER TYPE fuera de transacción, y acá van a aparecer más.
ALTER TABLE public.sesion_oficios_tratados
  ADD COLUMN IF NOT EXISTS motivo_cierre TEXT;

ALTER TABLE public.sesion_oficios_tratados
  DROP CONSTRAINT IF EXISTS sesion_oficios_motivo_cierre_valido;

ALTER TABLE public.sesion_oficios_tratados
  ADD CONSTRAINT sesion_oficios_motivo_cierre_valido
  CHECK (motivo_cierre IS NULL
         OR motivo_cierre IN ('respondio', 'expediente_cerrado', 'cerrado_a_mano'));

COMMENT ON COLUMN public.sesion_oficios_tratados.motivo_cierre IS
  'Por qué dejó de estar pendiente: respondio | expediente_cerrado | cerrado_a_mano. '
  'expediente_cerrado NO cuenta como atraso del organismo (el proyecto se murió, no '
  'hubo a quién responderle). NULL = cerrado antes de la mig 122.';

-- El camino caliente del panel de control de gestión: los cerrados con atraso,
-- por región. Parcial porque las filas sin atraso congelado no dicen nada ahí.
CREATE INDEX IF NOT EXISTS idx_sesion_oficios_atraso_cerrado
  ON public.sesion_oficios_tratados (region_cod, motivo_cierre, dias_atraso_al_cerrar)
  WHERE dias_atraso_al_cerrar IS NOT NULL;

-- ══ 2. Las fotos (tabla nueva) ══════════════════════════════════════════════
--
-- Lo de arriba resuelve el pasado de CADA oficio, pero no el STOCK: «cuántos
-- vencidos tenía la DGA hace un mes» no se reconstruye de ninguna fila, porque
-- los que se resolvieron ya no están y los que siguen abiertos tenían otro
-- atraso. Eso solo se sabe si se anotó, y hay que anotarlo por adelantado.
--
-- Manuel, 2026-09-30: «lo que quiero es poder saber durante los últimos 2 meses,
-- cada 15 días (es decir 4 fotos) qué OAECAS demoran fuera de plazo y cuánto se
-- demoran en promedio». Cuatro fotos, no una serie diaria — así que la foto se
-- toma AL CERRAR LA SESIÓN, que es el ritmo del comité y el momento en que el
-- número quiere decir algo: «así estábamos cuando nos juntamos». Con un respaldo
-- automático si pasan 20 días sin ninguna, para que una reunión postergada no
-- deje un hueco en la serie.
--
-- Una fila por (región, fecha, organismo). No se guarda oficio por oficio: la
-- pregunta es por organismo y guardar el detalle multiplicaría la tabla por 9
-- sin responder nada más.

CREATE TABLE IF NOT EXISTS public.oficios_foto_oaeca (
  id                  BIGSERIAL PRIMARY KEY,
  -- DATE y no timestamptz: la unidad de la serie es el día, y dos fotos del
  -- mismo día son la misma foto (ver el índice único).
  tomada_el           DATE NOT NULL,
  region_cod          TEXT NOT NULL,
  -- El nombre como lo escribe el SEIA, con jurisdicción, igual que
  -- `sesion_oficios_tratados.oaeca_sea` y `sesion_compromisos.oaeca_objetivo`
  -- (mig 120): no hay FK al catálogo `oaeca` porque son dos vocabularios y
  -- cruzarlos esconde el error en las filas que no calzan.
  oaeca               TEXT NOT NULL,
  ministerio          TEXT,

  pendientes          SMALLINT NOT NULL DEFAULT 0,
  vencidos            SMALLINT NOT NULL DEFAULT 0,
  -- Suma y no promedio: el promedio de promedios no es el promedio. Con la suma
  -- y la cuenta se puede agregar por ministerio, por región o por país sin
  -- volver a mirar los oficios.
  dias_atraso_total   INTEGER  NOT NULL DEFAULT 0,

  -- El corte que hace comparables a dos regiones. Se midió el 2026-09-30: de
  -- 546 oficios pendientes, solo 90 pertenecían a un proyecto de alguna cartera
  -- y 456 venían sueltos del Excel nacional. Sin esta distinción, la región que
  -- subió el archivo más grande parece la que trabaja peor.
  de_cartera          SMALLINT NOT NULL DEFAULT 0,
  vencidos_de_cartera SMALLINT NOT NULL DEFAULT 0,

  -- 'sesion'  = la saca el cierre de una sesión del Comité (lo normal).
  -- 'respaldo'= la saca el cron porque pasaron 20 días sin sesión.
  origen              TEXT NOT NULL CHECK (origen IN ('sesion', 'respaldo')),
  -- ON DELETE SET NULL: si se borra la sesión, la foto sigue siendo un hecho.
  sesion_id           BIGINT REFERENCES public.eje_sesiones(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.oficios_foto_oaeca IS
  'Fotos del stock de oficios pendientes por organismo, una por sesión cerrada '
  '(o del cron si pasaron 20 días). Es la ÚNICA forma de ver la evolución: la '
  'base guarda el estado de hoy y el stock del pasado no se reconstruye. Ver '
  'mig 122.';

-- Una foto por organismo por día por región. Normalizado igual que el índice de
-- la mig 120, porque la fuente no es consistente con mayúsculas ni espacios.
-- Idempotente de verdad: cerrar dos sesiones el mismo día no duplica la serie,
-- la reescribe (el upsert apunta acá).
CREATE UNIQUE INDEX IF NOT EXISTS uq_oficios_foto_dia
  ON public.oficios_foto_oaeca (region_cod, tomada_el, lower(btrim(oaeca)));

-- Leer la serie de una región es el único acceso que importa.
CREATE INDEX IF NOT EXISTS idx_oficios_foto_region_fecha
  ON public.oficios_foto_oaeca (region_cod, tomada_el DESC);

ALTER TABLE public.oficios_foto_oaeca ENABLE ROW LEVEL SECURITY;

-- Lectura igual que `seia_oficios_import` (mig 117): quien opera un comité en
-- alguna región necesita ver la serie. La escritura la hace el service role
-- desde el cierre de sesión y desde el cron — sin policy de INSERT/UPDATE,
-- nadie más escribe, que es lo que hace confiable a una serie histórica.
DROP POLICY IF EXISTS oficios_foto_oaeca_select ON public.oficios_foto_oaeca;
CREATE POLICY oficios_foto_oaeca_select ON public.oficios_foto_oaeca
  FOR SELECT TO authenticated
  USING (public.current_user_role() <> 'viewer');

-- Idempotente. Revertir = DROP TABLE oficios_foto_oaeca y borrar las dos
-- columnas de sesion_oficios_tratados; nada de lo existente depende de ellas.
