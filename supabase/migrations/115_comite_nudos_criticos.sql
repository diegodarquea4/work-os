-- ============================================================================
-- 115_comite_nudos_criticos.sql — El Comité de Infraestructura pasa a llamarse
-- «Comité de Nudos Críticos» (Manuel, 2026-09-23).
--
-- El nombre que la gente ve NO vive en el código: sale de
-- `region_config.infraestructura_nombre`, y el código solo tiene el respaldo
-- para cuando esa fila falta. Por eso el rename es mitad código y mitad dato —
-- sin este UPDATE, la pestaña diría un nombre y el panel por dentro otro.
--
-- Lo lee el tab del comité, el acta (punto de antecedentes), el calendario
-- regional, la ficha de iniciativa y las actas de Gabinete que lo nombran.
--
-- Las 16 regiones tenían exactamente 'Comité de Infraestructura'; se acota el
-- WHERE a ese valor para no pisar una región que ya lo hubiera personalizado.
--
-- NO se toca:
--   · `infraestructura_tag` — sigue siendo 'CRI'. Es la etiqueta de la cartera,
--     no el nombre del comité, y renombrarla dejaría fuera a las iniciativas
--     ya etiquetadas.
--   · Las claves de capacidad `comite.infraestructura.*` — están guardadas por
--     usuario en `user_capabilities`; renombrarlas dejaría a la gente sin
--     acceso al módulo. Solo cambió su etiqueta en pantalla.
--   · `instancia = 'infraestructura'` en las tablas de sesión — es la llave
--     interna que amarra sesiones, compromisos y actas ya existentes.
--
-- Idempotente: correrla de nuevo no hace nada (el WHERE ya no calza).
-- Se revierte invirtiendo los dos valores del UPDATE.
-- ============================================================================

UPDATE public.region_config
   SET infraestructura_nombre = 'Comité de Nudos Críticos'
 WHERE infraestructura_nombre = 'Comité de Infraestructura';

COMMENT ON COLUMN public.region_config.infraestructura_nombre IS
  'Nombre visible del comité en el panel, el acta y el calendario. Desde la mig 115: «Comité de Nudos Críticos». Es el dato que manda; el string en el código es solo el respaldo si falta la fila.';
