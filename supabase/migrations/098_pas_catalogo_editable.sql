-- ============================================================================
-- 098_pas_catalogo_editable.sql
--
-- El catálogo de PAS (mig 095) nació de solo-lectura-y-agregar: tenía policies
-- de SELECT e INSERT, ninguna de UPDATE. Con el catálogo ya administrable
-- desde la cartera de proyectos (verlos / editarlos / agregar), corregir un
-- nombre mal escrito o completar el órgano otorgante de una fila necesita
-- UPDATE — sin esta policy la RLS rechaza la escritura en silencio.
--
-- Mismo criterio que las otras dos: cualquiera que no sea `viewer`. Es un
-- catálogo de referencia compartido por las 16 regiones, no un dato regional,
-- así que no se acota por región (igual que `oaeca`, mig 051).
--
-- DELETE sigue sin policy a propósito: un PAS borrado dejaría colgando los
-- `comite_economico_proyecto_permiso` que lo referencian (la FK lo impediría,
-- pero el intento fallaría con un error feo). Si algún día se necesita, va con
-- su propia decisión sobre qué hacer con los permisos ya asociados.
-- ============================================================================

CREATE POLICY pas_catalogo_update ON public.pas_catalogo
  FOR UPDATE TO authenticated
  USING (public.current_user_role() <> 'viewer')
  WITH CHECK (public.current_user_role() <> 'viewer');
