-- A conversa em tempo real.
--
-- Publicando a tabela, o Postgres EMPURRA a linha nova pelo WebSocket e a tela
-- reage na hora. A política de acesso da tabela continua valendo: cada clínica
-- recebe só as próprias mensagens.

ALTER TABLE public.wa_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'wa_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_messages;
  END IF;
END $$;

-- O funil de Leads passa a morar aqui.

CREATE TABLE public.funnel_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_funnel_stages_owner_pos
  ON public.funnel_stages (owner_id, position);

CREATE TABLE public.funnel_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.funnel_stages(id) ON DELETE RESTRICT,

  -- A identidade da pessoa, em ordem de confiança.
  phone text,
  conversation_id text,
  contact_id text,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,

  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uma pessoa, um card.
CREATE UNIQUE INDEX idx_funnel_cards_owner_phone
  ON public.funnel_cards (owner_id, phone)
  WHERE phone IS NOT NULL;

-- Quem não tem telefone é identificado pela conversa.
CREATE UNIQUE INDEX idx_funnel_cards_owner_conversa
  ON public.funnel_cards (owner_id, conversation_id)
  WHERE phone IS NULL AND conversation_id IS NOT NULL;

CREATE INDEX idx_funnel_cards_owner_stage
  ON public.funnel_cards (owner_id, stage_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnel_stages TO authenticated;
GRANT ALL ON public.funnel_stages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnel_cards TO authenticated;
GRANT ALL ON public.funnel_cards TO service_role;

ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS funnel_stages_scoped ON public.funnel_stages;
CREATE POLICY funnel_stages_scoped ON public.funnel_stages
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

DROP POLICY IF EXISTS funnel_cards_scoped ON public.funnel_cards
;
CREATE POLICY funnel_cards_scoped ON public.funnel_cards
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

-- Marcas de tempo nas tabelas novas
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_funnel_stages_updated_at ON public.funnel_stages;
CREATE TRIGGER update_funnel_stages_updated_at BEFORE UPDATE ON public.funnel_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_funnel_cards_updated_at ON public.funnel_cards;
CREATE TRIGGER update_funnel_cards_updated_at BEFORE UPDATE ON public.funnel_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();