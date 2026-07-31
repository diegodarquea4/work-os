-- ============================================================================
-- 051_oaeca_y_oficios_directos.sql
--
-- Cambio de diseño del Comité Seguimiento de la Inversión: los oficios
-- pendientes ya NO se importan desde un Excel semanal — se cargan a mano
-- dentro de cada sesión (zona 3, mismo espíritu que "Integrantes"): OAECA
-- (organismo) + fecha límite de respuesta + proyecto que considera.
--
-- oficios_pendientes (catálogo importado, mig 049) deja de tener sentido.
-- sesion_oficios_tratados pierde los campos que venían del Excel y gana
-- referencias reales: oaeca_id (catálogo nuevo, autoincremental) y
-- proyecto_id (FK real a v2_proyectos_inversion, ya usada por
-- sesion_proyectos). La tabla está vacía (0 filas) — ALTER directo.
-- ============================================================================

DROP TABLE IF EXISTS public.oficios_pendientes;

-- Catálogo de OAECA — autoincremental: precargado con la lista real (ver
-- seed abajo) y crece cuando alguien escribe uno nuevo al cargar un oficio.
CREATE TABLE public.oaeca (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT
);

ALTER TABLE public.oaeca ENABLE ROW LEVEL SECURITY;

CREATE POLICY oaeca_select ON public.oaeca
  FOR SELECT TO authenticated
  USING (public.current_user_role() <> 'viewer');

CREATE POLICY oaeca_insert ON public.oaeca
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() <> 'viewer');

-- Seed: lista real de OAECA provista por el usuario.
INSERT INTO public.oaeca (nombre) VALUES
  ('Consejo de Monumentos Nacionales'),
  ('DGA'),
  ('D.Vialidad'),
  ('GORE'),
  ('SAG'),
  ('SEREMI de Agricultura'),
  ('SEREMI de Desarrollo Social y Familia'),
  ('SEREMI de Salud'),
  ('SEREMI MA'),
  ('SEREMI de Obras Públicas'),
  ('SBAP'),
  ('CONADI'),
  ('SEREMI de Bienes Nacionales'),
  ('SEREMI de Energía'),
  ('SEREMI de Transportes y Telecomunicaciones'),
  ('SEREMI de Vivienda y Urbanismo'),
  ('SERVIU'),
  ('SERNAGEOMIN'),
  ('SERNATUR'),
  ('SISS'),
  ('CONAF'),
  ('DOH'),
  ('DGAC'),
  ('SUBPESCA'),
  ('D.Arquitectura'),
  ('GOB. Maritima'),
  ('SEREMI de Minería'),
  ('SEC'),
  ('SEA'),
  ('CCHEN'),
  ('MTT'),
  ('BBNN'),
  ('MINVU'),
  ('Sub. Agricultura'),
  ('Sub. Energía'),
  ('Sub. Salud'),
  ('Sub. SS'),
  ('Sub. MA'),
  ('UAMM')
ON CONFLICT (nombre) DO NOTHING;

-- sesion_oficios_tratados: reemplaza los campos importados del Excel por
-- referencias reales, cargadas a mano en la sesión.
ALTER TABLE public.sesion_oficios_tratados
  DROP COLUMN IF EXISTS id_expediente,
  DROP COLUMN IF EXISTS nombre_proyecto,
  DROP COLUMN IF EXISTS ministerio,
  DROP COLUMN IF EXISTS oaeca,
  DROP COLUMN IF EXISTS tipo_oficio,
  ADD COLUMN oaeca_id BIGINT NOT NULL REFERENCES public.oaeca(id),
  ADD COLUMN proyecto_id TEXT NOT NULL REFERENCES public.v2_proyectos_inversion(id);
