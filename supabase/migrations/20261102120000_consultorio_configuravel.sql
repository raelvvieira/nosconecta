-- O consultório configurável: o que o onboarding e as Configurações gravam
-- para que outro consultório use o sistema sem nada da NÓS.
--
--  - clinicas: logo, área de atuação, como o paciente paga, avaliação,
--    políticas de falta e cancelamento, se a assistente pode dar preço de
--    harmonização, e o andamento do onboarding;
--  - clinic_units: link do mapa e "como chegar";
--  - campanhas: preço com validade, que a assistente usa só dentro do período.
--
-- Os padrões reproduzem o que a NÓS já fazia (avaliação sem custo, sem preço
-- de harmonização fora da tabela), para nada mudar no atendimento atual.

ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS logo_path text,
  ADD COLUMN IF NOT EXISTS area_atuacao text NOT NULL DEFAULT 'odonto_estetica'
    CHECK (area_atuacao IN ('odonto', 'estetica', 'odonto_estetica', 'medica')),
  ADD COLUMN IF NOT EXISTS formas_pagamento text[] NOT NULL DEFAULT ARRAY['pix', 'cartao', 'dinheiro'],
  ADD COLUMN IF NOT EXISTS parcelas_max integer CHECK (parcelas_max IS NULL OR parcelas_max BETWEEN 1 AND 24),
  -- NULL = parcelamento sem juros; N = tem juros a partir de N parcelas.
  ADD COLUMN IF NOT EXISTS juros_a_partir integer CHECK (juros_a_partir IS NULL OR juros_a_partir BETWEEN 2 AND 24),
  ADD COLUMN IF NOT EXISTS parcela_minima numeric(10, 2),
  ADD COLUMN IF NOT EXISTS avaliacao_gratuita boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS avaliacao_valor numeric(10, 2),
  ADD COLUMN IF NOT EXISTS avaliacao_abate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS politica_falta text,
  ADD COLUMN IF NOT EXISTS politica_cancelamento text,
  ADD COLUMN IF NOT EXISTS preco_harmonizacao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_passo text,
  ADD COLUMN IF NOT EXISTS onboarding_concluido_em timestamptz;

-- A NÓS já está configurada: não abre o onboarding para ela.
UPDATE public.clinicas SET onboarding_concluido_em = now() WHERE onboarding_concluido_em IS NULL;

ALTER TABLE public.clinic_units
  ADD COLUMN IF NOT EXISTS maps_url text,
  ADD COLUMN IF NOT EXISTS como_chegar text;

CREATE TABLE IF NOT EXISTS public.campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  nome text NOT NULL,
  inicio date NOT NULL,
  fim date NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  -- [{ "nome": "Toxina botulínica", "precoVista": 950, "parcelas": 6, "valorParcela": 179 }]
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fim >= inicio)
);
CREATE INDEX IF NOT EXISTS campanhas_owner_idx ON public.campanhas (owner_id, fim);
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campanhas_do_consultorio ON public.campanhas;
CREATE POLICY campanhas_do_consultorio ON public.campanhas
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));
