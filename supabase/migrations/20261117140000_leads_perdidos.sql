-- Leads perdidos: quem a clínica chamou, tentou, e que não vai agendar.
--
-- O funil de Leads é calculado a partir da conversa e da agenda — não há um
-- "card" ao qual pendurar uma negociação perdida. Esta tabela guarda o desfecho
-- por telefone, com o MOTIVO (as etapas do funil de Perdidos são os motivos).
-- Aditiva: nada existente muda. Reabrir apaga a linha e o lead volta ao funil.

CREATE TABLE IF NOT EXISTS public.leads_perdidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fone text NOT NULL,
  crm_contact_id text,
  conversation_id text,
  name text NOT NULL DEFAULT '',
  motivo text NOT NULL,
  observacao text,
  valor numeric,
  perdido_por uuid,
  perdido_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, fone)
);

CREATE INDEX IF NOT EXISTS leads_perdidos_por_motivo_idx
  ON public.leads_perdidos (owner_id, motivo);

ALTER TABLE public.leads_perdidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leads_perdidos_da_clinica ON public.leads_perdidos;
CREATE POLICY leads_perdidos_da_clinica ON public.leads_perdidos
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads_perdidos TO authenticated;
GRANT ALL ON public.leads_perdidos TO service_role;
REVOKE ALL ON public.leads_perdidos FROM anon;
