-- 036_conflictos_regionales.sql
-- Carga de PDF de "conflictos regionales" por región (paralelo a planes_regionales).
-- Un archivo por región en el bucket PRIVADO 'conflictos-regionales', path {cod}.pdf.
-- archivo_url guarda el PATH relativo (se firma con signed URL al servir).
-- Escrituras: solo server-side con service role (bypassa RLS). Lectura del panel
-- admin: vía API route con service role. En una sesión futura este PDF se
-- inyectará verbatim en la minuta regional (fuera de alcance de esta migración).

CREATE TABLE IF NOT EXISTS public.conflictos_regionales (
  region_cod  text PRIMARY KEY,
  archivo_url text,
  uploaded_at timestamptz DEFAULT now(),
  uploaded_by text
);

ALTER TABLE public.conflictos_regionales ENABLE ROW LEVEL SECURITY;

-- Lectura para autenticados (consistente con el resto de tablas world-readable);
-- las escrituras igual solo ocurren server-side con service role.
DROP POLICY IF EXISTS conflictos_regionales_select ON public.conflictos_regionales;
CREATE POLICY conflictos_regionales_select
  ON public.conflictos_regionales
  FOR SELECT
  TO authenticated
  USING (true);

-- Bucket privado para los PDFs de conflictos (idempotente).
INSERT INTO storage.buckets (id, name, public)
VALUES ('conflictos-regionales', 'conflictos-regionales', false)
ON CONFLICT (id) DO NOTHING;
