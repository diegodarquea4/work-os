-- ============================================================================
-- 101_avances_de_la_sesion.sql
--
-- Vínculo explícito avance → sesión, para que el acta del Comité Económico
-- pueda reportar los avances que se registraron DURANTE esa sesión, bajo cada
-- proyecto tratado.
--
-- Por qué una columna y no una heurística: la alternativa era deducirlo por
-- fecha (avances del día de la sesión) o por ventana de `created_at` entre que
-- el borrador se abre y se cierra. Las dos mienten — un borrador puede quedar
-- abierto varios días, y un proyecto puede recibir avances ese mismo día por
-- fuera de la sesión. Un avance pertenece al acta solo si se escribió con la
-- sesión abierta, y eso lo sabe la UI en el momento de crearlo, no una query
-- después.
--
-- Nullable y sin default: un avance registrado fuera de una sesión (el caso
-- normal, desde la cartera) sigue teniendo NULL y no aparece en ningún acta.
-- ON DELETE SET NULL: si algún día se borra una sesión, el avance es del
-- proyecto y sobrevive — solo pierde la referencia al acta.
-- ============================================================================

ALTER TABLE public.comite_economico_proyecto_seguimiento
  ADD COLUMN IF NOT EXISTS sesion_id BIGINT REFERENCES public.eje_sesiones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cep_seguimiento_sesion
  ON public.comite_economico_proyecto_seguimiento (sesion_id)
  WHERE sesion_id IS NOT NULL;

-- Misma columna en los seguimientos de iniciativas, anticipando que el acta
-- reportara también los avances de las iniciativas públicas tratadas.
-- REVERTIDA por la mig 102: la decisión fue que una iniciativa pública figure
-- en el acta solo como tratada en la sesión, sin detalle de avances, con lo
-- que esta columna quedaba sin nadie que la escribiera. Se deja el ALTER acá
-- para que la 101 se lea como lo que es y el historial no mienta.
ALTER TABLE public.seguimientos
  ADD COLUMN IF NOT EXISTS sesion_id BIGINT REFERENCES public.eje_sesiones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_seguimientos_sesion
  ON public.seguimientos (sesion_id)
  WHERE sesion_id IS NOT NULL;
