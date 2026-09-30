-- 117_oficios_seia_importados.sql
--
-- Los oficios pendientes del SEIA dejan de tipearse a mano: se importan.
--
-- ── Por qué esta migración deshace parte de la 051 ──────────────────────────
--
-- La mig 049 creó `sesion_oficios_tratados` con las columnas del Excel del
-- SEIA (id_expediente, nombre_proyecto, ministerio, oaeca, tipo_oficio) y la
-- mig 051 las SACÓ a propósito, para reemplazarlas por referencias reales
-- «cargadas a mano en la sesión». Esta migración las devuelve, porque el
-- origen vuelve a ser el archivo del SEIA — pero sin quitar nada de lo que la
-- 051 construyó: las referencias siguen ahí y siguen siendo obligatorias para
-- los oficios que levanta el comité.
--
-- Decisión de Manuel (2026-09-28), con el conflicto a la vista: una sola lista
-- de oficios en vez de una tabla aparte, aunque convivan dos orígenes.
--
-- ── La columna que parte las aguas ──────────────────────────────────────────
--
--   automatico = false  → lo levantó el comité en una sesión (lo de siempre).
--                         Exige sesion_origen_id, oaeca_id y exactamente una
--                         referencia de proyecto. Nada cambia para estas filas.
--   automatico = true   → vino del SEIA. No tiene sesión (existe antes de
--                         cualquier reunión), su OAECA es texto libre del SEIA
--                         —no calza con el catálogo `oaeca`, que usa nombres
--                         cortos— y puede no referenciar ningún proyecto de la
--                         cartera.
--
-- Los CHECK de abajo son lo que impide que aflojar los NOT NULL degrade a los
-- oficios manuales: sin ellos, un bug de la UI podría insertar un oficio de
-- sesión sin sesión y nadie se enteraría.
--
-- Idempotente. Revertir = borrar las filas con automatico = true.

-- ── 1. Un oficio importado no nace en una sesión ────────────────────────────
ALTER TABLE public.sesion_oficios_tratados
  ALTER COLUMN sesion_origen_id DROP NOT NULL,
  ALTER COLUMN oaeca_id         DROP NOT NULL;

-- ── 2. Vuelven las columnas del archivo del SEIA ────────────────────────────
ALTER TABLE public.sesion_oficios_tratados
  ADD COLUMN IF NOT EXISTS id_expediente     BIGINT,
  ADD COLUMN IF NOT EXISTS nombre_proyecto   TEXT,
  ADD COLUMN IF NOT EXISTS ministerio        TEXT,
  -- El organismo tal como lo nombra el SEIA. NO es `oaeca_id`: aquel es un
  -- catálogo curado de nombres cortos ('Sub. MA', 'UAMM') y esto es texto
  -- libre ('Gobierno Regional, Región de Tarapacá'). Conviven a propósito.
  ADD COLUMN IF NOT EXISTS oaeca_nombre      TEXT,
  -- La variante con jurisdicción que trae la columna «OAECCA (SEA)».
  ADD COLUMN IF NOT EXISTS oaeca_sea         TEXT,
  ADD COLUMN IF NOT EXISTS tipo_oficio       TEXT,
  ADD COLUMN IF NOT EXISTS tipo_presentacion TEXT,   -- DIA | EIA
  ADD COLUMN IF NOT EXISTS fecha_oficio      DATE,
  ADD COLUMN IF NOT EXISTS emisor            TEXT,
  ADD COLUMN IF NOT EXISTS url_proyecto      TEXT,
  ADD COLUMN IF NOT EXISTS url_oficio        TEXT,
  -- La región tal como la declara el SEIA, antes de mapearla a region_cod.
  -- Se guarda cruda para poder auditar un mapeo que salió mal sin volver a
  -- bajar el archivo — y porque 'Interregional' no es una región del panel.
  ADD COLUMN IF NOT EXISTS region_seia       TEXT;

-- ── 2b. De dónde sale la región, que es la pregunta de fondo ────────────────
--
-- La región de un oficio es la del PROYECTO al que cuelga, no la que declara
-- el SEIA (decisión de Manuel): el oficio existe para el comité que sigue ese
-- proyecto. El vínculo se resuelve solo, cruzando el expediente del oficio
-- contra la cartera:
--
--   comite_economico_proyecto.origen_id = 'seia_' || id_expediente
--   …con origen_sistema = 'seia'
--
-- OJO con ese prefijo: la cartera guarda 'seia_2156785500' porque hereda el id
-- de v2_proyectos_inversion (`seia_${EXPEDIENTE_ID}` en el sync), mientras el
-- archivo trae el número pelado. Cruzarlos sin el prefijo da CERO coincidencias
-- y ningún error — el peor tipo de bug.
--
-- Mientras el expediente no esté en ninguna cartera, el oficio entra igual con
-- la región que declara el SEIA, a modo PROVISORIO, y queda "sin asignar"
-- (automatico = true y sin referencia de proyecto). No se deja la región en
-- NULL a propósito: la política de lectura es
-- `current_user_can('comite.economico.operar', region_cod)`, así que una fila
-- sin región sería invisible justo para quien tiene que verla, y arreglarlo
-- exigiría tocar una política SELECT. Al entrar el proyecto a una cartera, la
-- importación siguiente engancha el oficio y la región pasa a ser la del
-- proyecto.

-- ── 3. Procedencia e idempotencia ───────────────────────────────────────────
-- `automatico` con el mismo significado que en la mig 109 (reconciliación de
-- la cartera): lo escribió una máquina, no una persona.
ALTER TABLE public.sesion_oficios_tratados
  ADD COLUMN IF NOT EXISTS automatico   BOOLEAN NOT NULL DEFAULT false,
  -- idDocumento del oficio en el SEIA: la llave natural. Es lo que hace que
  -- reimportar el mismo archivo no duplique ni una fila.
  ADD COLUMN IF NOT EXISTS id_documento BIGINT,
  ADD COLUMN IF NOT EXISTS importado_at TIMESTAMPTZ;

-- Un oficio puede existir en DOS regiones: si el mismo expediente está en la
-- cartera de dos, las dos lo tratan en su sesión (decisión de Manuel). Por eso
-- la llave natural es el documento MÁS la región, no el documento solo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sesion_oficios_documento
  ON public.sesion_oficios_tratados (id_documento, region_cod)
  WHERE automatico;

CREATE INDEX IF NOT EXISTS idx_sesion_oficios_expediente
  ON public.sesion_oficios_tratados (id_expediente)
  WHERE automatico;

-- ── 4. Los CHECK que protegen a los oficios manuales ────────────────────────
-- Aflojar un NOT NULL afloja para TODOS. Estos tres constraints devuelven la
-- exigencia a las filas que la tenían, y solo a ellas.

ALTER TABLE public.sesion_oficios_tratados
  DROP CONSTRAINT IF EXISTS sesion_oficios_manual_completo_ck;
ALTER TABLE public.sesion_oficios_tratados
  ADD CONSTRAINT sesion_oficios_manual_completo_ck CHECK (
    automatico OR (sesion_origen_id IS NOT NULL AND oaeca_id IS NOT NULL)
  );

ALTER TABLE public.sesion_oficios_tratados
  DROP CONSTRAINT IF EXISTS sesion_oficios_importado_completo_ck;
ALTER TABLE public.sesion_oficios_tratados
  ADD CONSTRAINT sesion_oficios_importado_completo_ck CHECK (
    NOT automatico OR (id_documento IS NOT NULL AND id_expediente IS NOT NULL)
  );

-- El CHECK de la mig 097 exigía EXACTAMENTE una referencia de proyecto. Un
-- oficio del SEIA puede no apuntar a ninguno: existe por el expediente, y que
-- ese expediente esté o no en la cartera del comité es otra pregunta. Para los
-- manuales la regla queda idéntica.
ALTER TABLE public.sesion_oficios_tratados
  DROP CONSTRAINT IF EXISTS sesion_oficios_referencia_unica_ck;
ALTER TABLE public.sesion_oficios_tratados
  ADD CONSTRAINT sesion_oficios_referencia_unica_ck CHECK (
    CASE WHEN automatico
      THEN (proyecto_privado_id IS NOT NULL)::int
         + (prioridad_id IS NOT NULL)::int
         + (proyecto_id IS NOT NULL)::int <= 1
      ELSE (proyecto_privado_id IS NOT NULL)::int
         + (prioridad_id IS NOT NULL)::int
         + (proyecto_id IS NOT NULL)::int = 1
    END
  );

-- ── 5. Huella de cada importación ───────────────────────────────────────────
-- Para poder decir en pantalla «datos al 28 de septiembre» y avisar cuando el
-- archivo quedó viejo, que es la única defensa contra una fuente que depende
-- de que alguien la baje.
CREATE TABLE IF NOT EXISTS public.seia_oficios_import (
  id BIGSERIAL PRIMARY KEY,
  -- Fecha de corte del archivo (la que trae la hoja «Atraso por ministerio»),
  -- no la de la importación: son distintas y la que importa es la del dato.
  fecha_corte DATE,
  archivo_nombre TEXT,
  filas_leidas INT NOT NULL DEFAULT 0,
  filas_nuevas INT NOT NULL DEFAULT 0,
  filas_actualizadas INT NOT NULL DEFAULT 0,
  filas_resueltas INT NOT NULL DEFAULT 0,
  filas_sin_region INT NOT NULL DEFAULT 0,
  detalle JSONB,
  importado_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.seia_oficios_import ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquiera que opere el comité en alguna región necesita saber de
-- cuándo es el dato. La escritura la hace el service role desde la ruta.
DROP POLICY IF EXISTS seia_oficios_import_select ON public.seia_oficios_import;
CREATE POLICY seia_oficios_import_select ON public.seia_oficios_import
  FOR SELECT TO authenticated
  USING (public.current_user_role() <> 'viewer');
