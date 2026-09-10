-- ============================================================================
-- 105_seia_ventana_vigencia.sql
--
-- El espejo del SEIA deja de traer los ~30.000 expedientes del país y trae
-- solo el universo que el comité puede seguir: aprobados con RCA calificada
-- dentro de los últimos 5 años, más los que siguen en evaluación. Caducado,
-- Abandonado, Revocado, Renuncia RCA, Rechazado, Desistido, No Admitido y No
-- calificado quedan fuera — ninguno va a ejecutarse.
--
-- El problema que resuelve esta columna: la ventana de 5 años es MÓVIL (corre
-- todos los días) y el buscador del SEIA **no devuelve** la fecha de
-- calificación — solo permite filtrar por ella. Sin la fecha, la base no puede
-- recalcular después quién se venció.
--
-- `visto_en_ventana_at` es la vuelta: cada corrida marca con su timestamp las
-- filas que el SEIA devolvió DENTRO de la ventana. Una fila cuya marca quedó
-- vieja es exactamente una que dejó de calificar — RCA vencida — y se detecta
-- comparando contra la última corrida:
--
--   SELECT * FROM seia_projects
--   WHERE visto_en_ventana_at < (SELECT max(visto_en_ventana_at) FROM seia_projects);
--
-- Así la cartera no acumula proyectos vencidos en silencio, sin necesidad de
-- un dato que la fuente no entrega.
--
-- Nullable: las filas cargadas por corridas anteriores (sin filtro de ventana)
-- quedan en NULL hasta que la primera corrida nueva las confirme o las deje
-- atrás. NULL = "todavía no verificada contra la ventana".
-- ============================================================================

ALTER TABLE public.seia_projects
  ADD COLUMN IF NOT EXISTS visto_en_ventana_at TIMESTAMPTZ;

COMMENT ON COLUMN public.seia_projects.visto_en_ventana_at IS
  'Última corrida del sync que vio este expediente DENTRO de la ventana de seguimiento (RCA <= 5 años, o en evaluación). Marca vieja = salió de la ventana. NULL = cargado antes de que existiera el filtro.';

CREATE INDEX IF NOT EXISTS idx_seia_projects_ventana
  ON public.seia_projects (visto_en_ventana_at DESC NULLS LAST);
