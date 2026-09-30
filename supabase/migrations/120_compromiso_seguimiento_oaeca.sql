-- 120_compromiso_seguimiento_oaeca.sql
--
-- A qué ORGANISMO se le está persiguiendo un compromiso de seguimiento de
-- oficios del SEIA.
--
-- ── Por qué el organismo y no el oficio ni el proyecto ──────────────────────
--
-- Los oficios cuelgan de un proyecto, pero quien tiene que responder es un
-- OAECA. La conversación real de la sesión es «la SEREMI de Medio Ambiente le
-- dice a la DGA: tenés estos 4 oficios pendientes de estos 2 proyectos». Uno
-- por oficio serían siete compromisos para un solo proyecto; uno por proyecto
-- partiría en dos esa misma conversación si el organismo debe oficios de dos
-- proyectos distintos. El organismo es la unidad de la gestión.
--
-- ── Por qué texto y no una FK a `oaeca` ─────────────────────────────────────
--
-- El catálogo de la mig 051 son nombres cortos escritos a mano («DGA»,
-- «SEREMI MA») y sin jurisdicción. El SEIA escribe «DGA, Región de Los Lagos»,
-- y esa jurisdicción es parte de la identidad: dentro de una región basta, y
-- entre regiones distingue. Cruzarlos sería un emparejamiento aproximado entre
-- dos vocabularios, con el error escondido en las filas que no calzan. Se
-- guarda lo que dice la fuente.
--
-- ── Quién es el responsable ─────────────────────────────────────────────────
--
-- `responsable_institucion` / `responsable_nombre`, que ya existen, y son
-- alguien de la NÓMINA DEL COMITÉ. La DGA no está en la sala: comprometer a
-- quien no está es no comprometer a nadie. El responsable es quien va a
-- perseguir al organismo, y `oaeca_objetivo` es a quién persigue.
--
-- Idempotente.

ALTER TABLE public.sesion_compromisos
  ADD COLUMN IF NOT EXISTS oaeca_objetivo TEXT;

COMMENT ON COLUMN public.sesion_compromisos.oaeca_objetivo IS
  'Organismo (OAECA) al que este compromiso persigue sus oficios pendientes del '
  'SEIA, tal como lo escribe la fuente y con su jurisdicción («DGA, Región de Los '
  'Lagos»). NULL = compromiso común. El responsable sigue siendo alguien de la '
  'nómina del comité, en responsable_institucion/responsable_nombre.';

-- Un organismo, una conversación abierta. Si la DGA sigue atrasada en la
-- sesión siguiente, lo que reaparece es ESTE compromiso —con su responsable y
-- su historia— y no uno nuevo que empiece de cero cada quince días.
--
-- Normalizado porque la fuente no es consistente con mayúsculas ni espacios, y
-- dos filas que solo difieren en eso son el mismo organismo.
--
-- Acotado a `oaeca_objetivo IS NOT NULL` para no tocar los compromisos
-- comunes, que pueden repetirse todo lo que haga falta.
CREATE UNIQUE INDEX IF NOT EXISTS uq_compromiso_oaeca_abierto
  ON public.sesion_compromisos (region_cod, lower(btrim(oaeca_objetivo)))
  WHERE oaeca_objetivo IS NOT NULL
    AND estado IN ('pendiente', 'en_curso');

-- El camino caliente: al cerrar la importación hay que preguntar, por región,
-- qué compromisos de seguimiento siguen abiertos para decidir cuáles se
-- cumplieron solos.
CREATE INDEX IF NOT EXISTS idx_compromiso_oaeca_region
  ON public.sesion_compromisos (region_cod, estado)
  WHERE oaeca_objetivo IS NOT NULL;

-- Sin RLS nueva: las policies de `sesion_compromisos` son por fila y por
-- región (instancia='inversion' → capacidad del comité), y esta es una columna
-- más de una fila que ya está gateada.
