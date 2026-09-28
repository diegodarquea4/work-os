-- 118_oficios_seia_llave_por_organismo.sql
--
-- Corrige la llave natural de los oficios importados del SEIA.
--
-- La mig 117 usó `id_documento` como llave, dando por sentado que un oficio
-- es un documento. No lo es: un oficio del SEA se dirige a VARIOS organismos a
-- la vez —hasta 22 en el archivo real— y el expediente guarda uno solo
-- documento con la lista de destinatarios en su «Distribución:». El archivo
-- trae una fila por organismo, todas apuntando al mismo `idDocumento`.
--
-- En números: 638 oficios pendientes sobre apenas 114 documentos.
--
-- Lo que hace pendiente a un oficio no es el documento, es que UN organismo
-- todavía no respondió. Así que la llave es el documento MÁS el organismo,
-- más la región (dos regiones pueden seguir el mismo expediente — mig 117).
--
-- Se distingue por `oaeca_sea` —la variante con jurisdicción, «CONAF, Región
-- de Coquimbo»— y no por `oaeca_nombre`, que es el nombre corto: con el corto
-- dos filas del archivo real colisionan, con el largo ninguna de las 638.
--
-- Idempotente. No hay datos que migrar: la 117 nunca llegó a completar una
-- importación, justamente porque este índice la frenó.

DROP INDEX IF EXISTS public.uq_sesion_oficios_documento;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sesion_oficios_documento_organismo
  ON public.sesion_oficios_tratados (id_documento, COALESCE(oaeca_sea, oaeca_nombre, ''), region_cod)
  WHERE automatico;

COMMENT ON COLUMN public.sesion_oficios_tratados.oaeca_sea IS
  'Organismo que debe responder, con su jurisdicción, tal como lo nombra el SEIA '
  '(«CONAF, Región de Coquimbo»). Junto con id_documento y region_cod forma la '
  'llave natural de un oficio importado: un mismo documento va a varios organismos.';
