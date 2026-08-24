-- ============================================================================
-- 074_gabinete_v2_schema.sql — Gabinete Regional v2 · PR-1 (parte ADITIVA)
--
-- Fundación de esquema para el rediseño "pauta como columna vertebral" (spec v2
-- de los analistas). TODO es aditivo/idempotente: columnas nuevas, tablas
-- nuevas, RLS+triggers de las tablas nuevas y backfill de `numero`. NO toca la
-- RLS de tablas existentes (eje_sesiones / gabinete_temas): eso vive en 075,
-- aparte, para aislar el único cambio con efecto observable (aplicar/revertir
-- por separado, con smoke regional — ver plan Fase B).
--
-- Coexistencia: NO mueve ni borra nada del pool `gabinete_temas` (sesion_id
-- NULL). El pool, la Preparación actual (TemasGabinetePanel) y la copia-de-fijos
-- del cierre (cerrar/route.ts:203-238) siguen intactos hasta PR-2.
--
-- Bordes resueltos en la revisión del dev:
--   #2 discriminador v1/v2 → `eje_sesiones.formato_acta` explícito (no "presencia
--      de pauta": las sesiones v1 cerradas también archivaron gabinete_temas).
--   #3 `numero` estampado → backfill que reproduce la derivación de render actual
--      (generarActaGabinete.ts:110-113) para no renumerar históricos.
--   #7 un solo relato general por tema → UNIQUE parcial en sesion_intervenciones.
-- ============================================================================

-- ── 1. gabinete_recurrentes (necesaria antes del ALTER que la referencia) ────
-- Plantilla de puntos que se repiten cada semana (PSG, probidad, agenda de
-- visitas…). Reemplaza el mecanismo `fijo`+copia-al-cierre (que se jubila en
-- PR-2). Al preparar la pauta se insertan como puntos borrador de ESA sesión.
CREATE TABLE IF NOT EXISTS public.gabinete_recurrentes (
  id                  BIGSERIAL PRIMARY KEY,
  region_cod          TEXT NOT NULL,
  titulo              TEXT NOT NULL,
  detalle             TEXT,
  proposito_plantilla TEXT,               -- "la pregunta" de partida
  activo              BOOLEAN NOT NULL DEFAULT true,
  orden               INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email    TEXT
);
CREATE INDEX IF NOT EXISTS idx_gabinete_recurrentes_region
  ON public.gabinete_recurrentes (region_cod, orden) WHERE activo;

-- ── 2. Columnas nuevas (aditivas) ───────────────────────────────────────────

-- eje_sesiones: fase de pauta (derivada de pauta_enviada_at, sin enum nuevo),
-- correlativo estampado, origen de carga, y el discriminador de formato de acta.
ALTER TABLE public.eje_sesiones
  ADD COLUMN IF NOT EXISTS pauta_enviada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS numero           INT,
  ADD COLUMN IF NOT EXISTS origen           TEXT NOT NULL DEFAULT 'panel'
    CHECK (origen IN ('panel','historica')),
  -- Discriminador explícito de formato de acta (borde #2): 1 = v1 (histórico),
  -- 2 = v2 (pauta). El render del acta keyea acá, NUNCA en "tiene temas".
  ADD COLUMN IF NOT EXISTS formato_acta     SMALLINT NOT NULL DEFAULT 1;

-- gabinete_temas: el punto de pauta. `titulo` es el título del punto; `texto`
-- (v1) pasa a ser el detalle → el render usa titulo ?? texto para filas legado.
ALTER TABLE public.gabinete_temas
  ADD COLUMN IF NOT EXISTS titulo        TEXT,
  ADD COLUMN IF NOT EXISTS proposito     TEXT,          -- "la pregunta"; NOT NULL vía zod salvo origen='en_sala'
  ADD COLUMN IF NOT EXISTS minutos       INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS origen        TEXT NOT NULL DEFAULT 'manual'
    CHECK (origen IN ('manual','pospuesto','anotado','sugerido','recurrente','en_sala','legado')),
  ADD COLUMN IF NOT EXISTS recurrente_id BIGINT REFERENCES public.gabinete_recurrentes(id),
  ADD COLUMN IF NOT EXISTS estado_cierre TEXT
    CHECK (estado_cierre IN ('tratado','sin_novedades','pospuesto','retirado'));
-- `fijo` queda DEPRECADO (no se borra la columna): deja de escribirse en v2.

-- sesion_compromisos: vínculo al tema + confirmación (NO tocar `estado`, que ya
-- existe con dominio pendiente/en_curso/cumplido — borde #2 de la revisión) +
-- tipo de plazo + responsable colectivo + marca de verificación en sala.
ALTER TABLE public.sesion_compromisos
  ADD COLUMN IF NOT EXISTS tema_id           BIGINT REFERENCES public.gabinete_temas(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS confirmado        BOOLEAN NOT NULL DEFAULT true,   -- default true: legado y comités quedan confirmados; solo la captura v2 crea false
  ADD COLUMN IF NOT EXISTS plazo_tipo        TEXT NOT NULL DEFAULT 'fecha'
    CHECK (plazo_tipo IN ('fecha','permanente','por_definir')),
  ADD COLUMN IF NOT EXISTS responsable_todas BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verificado_en_sala_sesion_id BIGINT REFERENCES public.eje_sesiones(id);

CREATE INDEX IF NOT EXISTS idx_sesion_compromisos_tema
  ON public.sesion_compromisos (tema_id) WHERE tema_id IS NOT NULL;

-- ── 3. Tablas nuevas hijas de tema / sesión ─────────────────────────────────

-- Responsables múltiples por tema. orden=1 = principal (precarga responsable de
-- compromisos e intervenciones). `institucion` es TEXT libre en BD; la app/zod
-- valida contra el catálogo de carteras de gabinete (lib/cartera.ts) en PR-2.
CREATE TABLE IF NOT EXISTS public.gabinete_tema_carteras (
  tema_id     BIGINT NOT NULL REFERENCES public.gabinete_temas(id) ON DELETE CASCADE,
  institucion TEXT NOT NULL,
  orden       INT NOT NULL DEFAULT 1,
  PRIMARY KEY (tema_id, institucion)
);

-- Vínculo N:N tema ↔ iniciativa del PREGO, por LLAVE ESTABLE id (nunca n).
CREATE TABLE IF NOT EXISTS public.gabinete_tema_iniciativas (
  tema_id      BIGINT NOT NULL REFERENCES public.gabinete_temas(id) ON DELETE CASCADE,
  prioridad_id BIGINT NOT NULL REFERENCES public.prioridades_territoriales(id),
  PRIMARY KEY (tema_id, prioridad_id)
);
CREATE INDEX IF NOT EXISTS idx_gabinete_tema_iniciativas_prioridad
  ON public.gabinete_tema_iniciativas (prioridad_id);

-- Apuntes por tema en dos niveles (corrección #1 del dev — NO cabe en
-- sesion_apuntes por su UNIQUE(sesion_id,institucion) + institucion NOT NULL):
-- fila con institucion NULL = relato general del tema; filas con institucion =
-- intervenciones atribuidas por cartera (varias por tema y por cartera).
CREATE TABLE IF NOT EXISTS public.sesion_intervenciones (
  id               BIGSERIAL PRIMARY KEY,
  sesion_id        BIGINT NOT NULL REFERENCES public.eje_sesiones(id) ON DELETE CASCADE,
  tema_id          BIGINT NOT NULL REFERENCES public.gabinete_temas(id) ON DELETE CASCADE,
  institucion      TEXT,                  -- NULL = relato general del tema
  texto            TEXT NOT NULL,
  orden            INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT
);
-- Un solo relato general por tema (borde #7); intervenciones (institucion NOT
-- NULL) no llevan unique — una cartera puede intervenir N veces.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sesion_intervenciones_relato
  ON public.sesion_intervenciones (sesion_id, tema_id) WHERE institucion IS NULL;
CREATE INDEX IF NOT EXISTS idx_sesion_intervenciones_tema
  ON public.sesion_intervenciones (tema_id, orden);

-- Vocerías de la semana (día · vocero · tema). Salen en el acta (sección propia)
-- y se precargan como recordatorio en la preparación siguiente.
CREATE TABLE IF NOT EXISTS public.sesion_vocerias (
  id         BIGSERIAL PRIMARY KEY,
  sesion_id  BIGINT NOT NULL REFERENCES public.eje_sesiones(id) ON DELETE CASCADE,
  dia        TEXT NOT NULL,
  vocero     TEXT NOT NULL,
  tema_texto TEXT NOT NULL,
  orden      INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sesion_vocerias_sesion
  ON public.sesion_vocerias (sesion_id, orden);

-- ── 4. RLS de las tablas nuevas (patrón mig 070) ────────────────────────────
-- viewer sin policies = sin acceso. staff_all (admin/editor). regional/operador
-- por capacidad comite.gabinete.operar. Los helpers can_operar_sesion /
-- can_operar_instancia ya existen (mig 070).

ALTER TABLE public.gabinete_recurrentes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gabinete_tema_carteras  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gabinete_tema_iniciativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesion_intervenciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesion_vocerias         ENABLE ROW LEVEL SECURITY;

-- gabinete_recurrentes: region_cod directo, instancia fija 'gabinete'.
DROP POLICY IF EXISTS gabinete_recurrentes_staff_all ON public.gabinete_recurrentes;
CREATE POLICY gabinete_recurrentes_staff_all ON public.gabinete_recurrentes
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin','editor'))
  WITH CHECK (public.current_user_role() IN ('admin','editor'));
DROP POLICY IF EXISTS gabinete_recurrentes_operar_select ON public.gabinete_recurrentes;
CREATE POLICY gabinete_recurrentes_operar_select ON public.gabinete_recurrentes
  FOR SELECT TO authenticated USING (public.can_operar_instancia('gabinete', region_cod));
DROP POLICY IF EXISTS gabinete_recurrentes_operar_insert ON public.gabinete_recurrentes;
CREATE POLICY gabinete_recurrentes_operar_insert ON public.gabinete_recurrentes
  FOR INSERT TO authenticated WITH CHECK (public.can_operar_instancia('gabinete', region_cod));
DROP POLICY IF EXISTS gabinete_recurrentes_operar_update ON public.gabinete_recurrentes;
CREATE POLICY gabinete_recurrentes_operar_update ON public.gabinete_recurrentes
  FOR UPDATE TO authenticated
  USING (public.can_operar_instancia('gabinete', region_cod))
  WITH CHECK (public.can_operar_instancia('gabinete', region_cod));
DROP POLICY IF EXISTS gabinete_recurrentes_operar_delete ON public.gabinete_recurrentes;
CREATE POLICY gabinete_recurrentes_operar_delete ON public.gabinete_recurrentes
  FOR DELETE TO authenticated USING (public.can_operar_instancia('gabinete', region_cod));

-- Tablas hijas por tema (gabinete_tema_carteras / _iniciativas): scope vía la
-- sesión del tema. staff_all + operar (select/insert/update/delete).
DO $mig$
DECLARE
  t text;
  tablas_tema text[] := ARRAY['gabinete_tema_carteras','gabinete_tema_iniciativas'];
BEGIN
  FOREACH t IN ARRAY tablas_tema LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_staff_all', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING (public.current_user_role() IN ('admin','editor'))
      WITH CHECK (public.current_user_role() IN ('admin','editor'))$p$, t||'_staff_all', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_operar_select', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (public.can_operar_sesion((SELECT gt.sesion_id FROM public.gabinete_temas gt WHERE gt.id = %I.tema_id)))$p$,
      t||'_operar_select', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_operar_insert', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (public.can_operar_sesion((SELECT gt.sesion_id FROM public.gabinete_temas gt WHERE gt.id = %I.tema_id)))$p$,
      t||'_operar_insert', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_operar_update', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (public.can_operar_sesion((SELECT gt.sesion_id FROM public.gabinete_temas gt WHERE gt.id = %I.tema_id)))
      WITH CHECK (public.can_operar_sesion((SELECT gt.sesion_id FROM public.gabinete_temas gt WHERE gt.id = %I.tema_id)))$p$,
      t||'_operar_update', t, t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_operar_delete', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (public.can_operar_sesion((SELECT gt.sesion_id FROM public.gabinete_temas gt WHERE gt.id = %I.tema_id)))$p$,
      t||'_operar_delete', t, t);
  END LOOP;
END
$mig$;

-- Tablas hijas por sesion_id (sesion_intervenciones / sesion_vocerias): patrón
-- 070 exacto. DELETE solo con sesión en 'borrador'.
DO $mig$
DECLARE
  t text;
  tablas_sesion text[] := ARRAY['sesion_intervenciones','sesion_vocerias'];
BEGIN
  FOREACH t IN ARRAY tablas_sesion LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_staff_all', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING (public.current_user_role() IN ('admin','editor'))
      WITH CHECK (public.current_user_role() IN ('admin','editor'))$p$, t||'_staff_all', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_operar_select', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (public.can_operar_sesion(sesion_id))$p$, t||'_operar_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_operar_insert', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (public.can_operar_sesion(sesion_id))$p$, t||'_operar_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_operar_update', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (public.can_operar_sesion(sesion_id))
      WITH CHECK (public.can_operar_sesion(sesion_id))$p$, t||'_operar_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_operar_delete', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (public.can_operar_sesion(sesion_id)
             AND EXISTS (SELECT 1 FROM public.eje_sesiones s
                         WHERE s.id = %I.sesion_id AND s.estado = 'borrador'))$p$,
      t||'_operar_delete', t, t);
  END LOOP;
END
$mig$;

-- ── 5. Triggers de inmutabilidad de las tablas nuevas ───────────────────────
-- Hijas por sesion_id: reusan sesion_hijas_bloquea_cerrada() (mig 044, lee
-- NEW/OLD.sesion_id; bypass service-role auth.uid() IS NULL).
DROP TRIGGER IF EXISTS sesion_intervenciones_bloquea_cerrada_trg ON public.sesion_intervenciones;
CREATE TRIGGER sesion_intervenciones_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.sesion_intervenciones
  FOR EACH ROW EXECUTE FUNCTION public.sesion_hijas_bloquea_cerrada();

DROP TRIGGER IF EXISTS sesion_vocerias_bloquea_cerrada_trg ON public.sesion_vocerias;
CREATE TRIGGER sesion_vocerias_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.sesion_vocerias
  FOR EACH ROW EXECUTE FUNCTION public.sesion_hijas_bloquea_cerrada();

-- Nietas por tema (gabinete_tema_carteras / _iniciativas): resuelven la sesión
-- vía el tema (no tienen sesion_id propio).
CREATE OR REPLACE FUNCTION public.gabinete_tema_hijas_bloquea_cerrada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid BIGINT;
  sestado TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  SELECT gt.sesion_id INTO sid FROM public.gabinete_temas gt
    WHERE gt.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.tema_id ELSE NEW.tema_id END;
  SELECT estado INTO sestado FROM public.eje_sesiones WHERE id = sid;
  IF sestado = 'cerrada' AND public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'la sesión está cerrada: sus datos son inmutables'
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS gabinete_tema_carteras_bloquea_cerrada_trg ON public.gabinete_tema_carteras;
CREATE TRIGGER gabinete_tema_carteras_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.gabinete_tema_carteras
  FOR EACH ROW EXECUTE FUNCTION public.gabinete_tema_hijas_bloquea_cerrada();

DROP TRIGGER IF EXISTS gabinete_tema_iniciativas_bloquea_cerrada_trg ON public.gabinete_tema_iniciativas;
CREATE TRIGGER gabinete_tema_iniciativas_bloquea_cerrada_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.gabinete_tema_iniciativas
  FOR EACH ROW EXECUTE FUNCTION public.gabinete_tema_hijas_bloquea_cerrada();

-- ── 6. Backfill de `numero` (borde #3, no destructivo) ──────────────────────
-- Reproduce la derivación de render actual (generarActaGabinete.ts:110-113):
-- posición por fecha con desempate por id, entre las sesiones de gabinete
-- CERRADAS de cada región. Solo filas sin numero (idempotente).
WITH ord AS (
  SELECT id, row_number() OVER (PARTITION BY region_cod ORDER BY fecha, id) AS rn
  FROM public.eje_sesiones
  WHERE instancia = 'gabinete' AND estado = 'cerrada'
)
UPDATE public.eje_sesiones e
SET numero = ord.rn
FROM ord
WHERE e.id = ord.id AND e.numero IS NULL;
