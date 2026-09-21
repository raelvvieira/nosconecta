-- O funil de Leads passa a morar aqui.
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
CREATE UNIQUE INDEX idx_funnel_cards_owner_phone
  ON public.funnel_cards (owner_id, phone)
  WHERE phone IS NOT NULL;

-- Quem não tem telefone é identificado pela conversa.
CREATE UNIQUE INDEX idx_funnel_cards_owner_conversa
  ON public.funnel_cards (owner_id, conversation_id)
  WHERE phone IS NULL AND conversation_id IS NOT NULL;

CREATE INDEX idx_funnel_cards_owner_stage
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
