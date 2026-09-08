-- ============================================================================
-- 100_pas_catalogo_borrable.sql
--
-- Completa la administración del catálogo de PAS: además de ver, editar (mig
-- 099) y agregar (mig 096), ahora se puede borrar una entrada.
--
-- La FK `comite_economico_proyecto_permiso.pas_id` se deja como está (sin
-- ON DELETE): en RESTRICT, la base RECHAZA borrar un PAS que algún proyecto
-- tenga asociado. Es a propósito y es lo contrario de un CASCADE — borrar del
-- catálogo un permiso en uso arrastraría los permisos de esos proyectos con su
-- estado (pendiente/otorgado/frenado) y dejaría avances apuntando al vacío.
-- Que la base lo rechace es el comportamiento correcto; la UI avisa antes con
-- el conteo de proyectos que lo usan, y traduce el error 23503 para el caso en
-- que el PAS esté en uso en una región que ese usuario no ve (su RLS le
-- esconde esas filas, así que el conteo del cliente da 0).
--
-- Mismo alcance que las otras policies del catálogo: cualquiera que no sea
-- `viewer`, sin acotar por región (es un catálogo nacional, igual que oaeca).
-- ============================================================================

CREATE POLICY pas_catalogo_delete ON public.pas_catalogo
  FOR DELETE TO authenticated
  USING (public.current_user_role() <> 'viewer');
