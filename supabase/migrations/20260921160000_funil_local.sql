-- O funil de Leads passa a morar aqui.
--
-- ── Por que tudo aqui é IF NOT EXISTS ────────────────────────────────────
--
-- O agente do Lovable aplicou esta migration JUNTO com a do tempo real, numa
-- só, gravada sob uma versão própria (20260921213038). Este arquivo continua
-- constando como pendente para ele — e um segundo "aplicar migrations
-- pendentes" tentaria criar tudo de novo. Sem as guardas, esse dia terminaria
-- num erro de "tabela já existe" que ninguém saberia de onde veio.
--
-- Os gatilhos de `updated_at` no fim não estavam na versão que escrevi: o
-- agente do Lovable os acrescentou por conta própria ao aplicar. Estão aqui
-- porque o arquivo precisa descrever o banco que existe, e não o que eu
-- imaginei.
--
-- ── O que ele era ────────────────────────────────────────────────────────
--
-- Etapas e cards viviam na conta do CRM externo, atrás de
-- `/api/v1/pipelines/{id}/pipeline_stages` e `/pipeline_items`. Só o funil de
-- LEADS: "Clientes" já é calculado aqui (funis.functions.ts sobre a view
-- patient_funnel_signals) e "Perdidos" também (sobre pipeline_deals).
--
-- ── A identidade do card muda ────────────────────────────────────────────
--
-- No CRM o card apontava para UMA conversa. Uma pessoa tem várias — foi por
-- isso que a caixa de entrada passou a unir tudo pelo número —, e o card só
-- casava com a conversa que o criou: a mesma pessoa escrevia de novo, abria
-- outra thread, e o funil dizia que ela não estava em etapa nenhuma.
--
-- Aqui a pessoa é o telefone normalizado. Quem não tem número — grupo, ou os
-- contatos que o WhatsApp identifica por lid — fica preso à conversa, que é o
-- único identificador que existe para eles.

CREATE TABLE IF NOT EXISTS public.funnel_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funnel_stages_owner_pos
  ON public.funnel_stages (owner_id, position);

CREATE TABLE IF NOT EXISTS public.funnel_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- RESTRICT, não CASCADE: apagar uma coluna não pode sumir em silêncio com as
  -- pessoas que estavam nela. A tela oferece o botão de excluir etapa, e quem
  -- clica está pensando na coluna, não em quem está dentro dela. O servidor
  -- recusa e diz quantos cards há ali.
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

-- Uma pessoa, um card. Sem isto, pôr no funil duas vezes a mesma pessoa a
-- partir de duas conversas dela criaria dois cards em duas colunas — e o funil
-- passaria a contar a mesma negociação duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_funnel_cards_owner_phone
  ON public.funnel_cards (owner_id, phone)
  WHERE phone IS NOT NULL;

-- Quem não tem telefone é identificado pela conversa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_funnel_cards_owner_conversa
  ON public.funnel_cards (owner_id, conversation_id)
  WHERE phone IS NULL AND conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_funnel_cards_owner_stage
  ON public.funnel_cards (owner_id, stage_id);

-- GRANT além da policy: no Supabase a RLS filtra linhas, mas sem privilégio de
-- tabela o papel `authenticated` nem chega a executar o comando. Faltar isso
-- foi o que quebrou a gravação das credenciais da Meta.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnel_stages TO authenticated;
GRANT ALL ON public.funnel_stages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnel_cards TO authenticated;
GRANT ALL ON public.funnel_cards TO service_role;

ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_cards ENABLE ROW LEVEL SECURITY;

-- `can_access_row(owner_id)` e não `owner_id = auth.uid()`: é o padrão desde a
-- migration de equipes (20260814120500), e é o que faz o funil ser visto por
-- quem trabalha na clínica e não só por quem é dono dela.
DROP POLICY IF EXISTS funnel_stages_scoped ON public.funnel_stages;
CREATE POLICY funnel_stages_scoped ON public.funnel_stages
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

DROP POLICY IF EXISTS funnel_cards_scoped ON public.funnel_cards;
CREATE POLICY funnel_cards_scoped ON public.funnel_cards
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

-- Marca de tempo automática.
--
-- Acrescentado pelo agente do Lovable na aplicação — ver o cabeçalho. A função
-- já existia no banco; o `CREATE OR REPLACE` a deixa idêntica em qualquer
-- ambiente que rode esta migration do zero.
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
