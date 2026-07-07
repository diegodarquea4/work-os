-- ============================================================================
-- 034_prevencion_respuesta.sql
--
-- Instrumento de auditoría "Prevención y Respuesta" (COGRID Regional · DCI),
-- migrado desde la herramienta HTML autónoma al panel (subtab dentro de PREGO).
--
-- Modelo: una fila por (region_cod, item_id). El contenido del instrumento
-- (26 puntos, ejes, checks, preguntas guía) vive en código estático
-- (`lib/prevencionRespuesta.ts`) — acá solo persistimos la RESPUESTA por
-- región: qué casillas se marcaron, override manual del semáforo, y los
-- comentarios de la conversación.
--
-- Decisiones de diseño:
--   - PK compuesta (region_cod, item_id): llave estable de mutación (upsert
--     con onConflict). Consistente con la "regla de llave de mutación" del repo.
--   - `estado` nullable + CHECK: solo se usa con override manual (manual=true)
--     o en los pasos de "Prueba de flujo" (sin checks). El semáforo derivado
--     de los checks se computa en el cliente (estadoDe), no se persiste.
--   - `checks` jsonb = array de booleanos alineado por índice a Item.checks.
--   - `comentarios` jsonb = [{ ts, texto, autor? }].
--   - RLS por rol idéntico a prego_monitoreo (mig 023): SELECT cualquier
--     autenticado (world-readable como el resto del panel); escritura
--     admin/editor. La tab PREGO ya está gateada a admin/editor en la UI.
--     Si más adelante se quiere que cada Delegación (rol regional) llene su
--     región, se amplía la policy (patrón metricas_eje). Deuda anotada.
--   - Aditiva e idempotente (IF NOT EXISTS + DROP POLICY IF EXISTS).
-- ============================================================================

-- ── Tabla ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prevencion_respuesta (
  region_cod  text NOT NULL,
  item_id     text NOT NULL,
  estado      text CHECK (estado IS NULL OR estado IN ('listo', 'parcial', 'nolisto')),  -- solo override manual / pasos de flujo
  manual      boolean NOT NULL DEFAULT false,   -- true = color fijado a mano (override)
  checks      jsonb   NOT NULL DEFAULT '[]'::jsonb,   -- array de booleanos alineado a Item.checks por índice
  comentarios jsonb   NOT NULL DEFAULT '[]'::jsonb,   -- [{ ts:number, texto:string, autor?:string }]
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text,
  PRIMARY KEY (region_cod, item_id)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.prevencion_respuesta ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier autenticado (como el resto del panel, world-readable autenticado).
DROP POLICY IF EXISTS prevencion_respuesta_select ON public.prevencion_respuesta;
CREATE POLICY prevencion_respuesta_select ON public.prevencion_respuesta
  FOR SELECT TO authenticated
  USING (true);

-- Escritura: admin/editor (igual que prego_monitoreo_write_by_role de la mig 023).
DROP POLICY IF EXISTS prevencion_respuesta_write_by_role ON public.prevencion_respuesta;
CREATE POLICY prevencion_respuesta_write_by_role ON public.prevencion_respuesta
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'editor'))
  WITH CHECK (public.current_user_role() IN ('admin', 'editor'));
