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

-- Consultório novo: categorias de despesa sem nada só de odontologia.
CREATE OR REPLACE FUNCTION public.criar_clinica(_nome text, _cidade text DEFAULT NULL::text, _whatsapp text DEFAULT NULL::text, _convite text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _pessoa text;
  _unidade uuid;
  c public.convites_de_consultorio%ROWTYPE;
  _plano text := 'ia';
  _dias integer := 14;
  _nome_limpo text := NULLIF(btrim(COALESCE(_nome, '')), '');
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_sessao');
  END IF;
  IF EXISTS (SELECT 1 FROM public.clinic_members WHERE user_id = _uid)
     OR EXISTS (SELECT 1 FROM public.clinicas WHERE owner_id = _uid) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_tem_consultorio');
  END IF;

  -- Sem convite: o cadastro aberto, pela página de vendas. Plano com IA e
  -- 14 dias de teste, que a plataforma muda depois no painel. Com convite: o
  -- plano e o teste que quem convidou escolheu.
  IF _convite IS NOT NULL THEN
    SELECT * INTO c
    FROM public.convites_de_consultorio
    WHERE token = _convite AND usado_em IS NULL AND revogado_em IS NULL AND expira_em > now()
    -- Dois cliques no mesmo link não criam dois consultórios.
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'convite_invalido');
    END IF;
    _plano := c.plano;
    _dias := c.dias_de_teste;
    _nome_limpo := COALESCE(_nome_limpo, c.nome_consultorio);
  END IF;

  IF _nome_limpo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_nome');
  END IF;

  SELECT u.email, COALESCE(NULLIF(btrim(p.full_name), ''), split_part(u.email, '@', 1))
  INTO _email, _pessoa
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = _uid;

  INSERT INTO public.clinicas (owner_id, nome, cidade, whatsapp, plano, situacao, teste_ate)
  VALUES (
    _uid, left(_nome_limpo, 120), NULLIF(btrim(COALESCE(_cidade, '')), ''),
    NULLIF(btrim(COALESCE(_whatsapp, '')), ''), _plano,
    CASE WHEN _dias > 0 THEN 'teste' ELSE 'ativa' END,
    CASE WHEN _dias > 0 THEN now() + make_interval(days => _dias) ELSE NULL END
  );

  INSERT INTO public.clinic_members (
    owner_id, user_id, name, email, phone, role, status, approved_at, approved_by
  )
  VALUES (_uid, _uid, _pessoa, _email, NULLIF(btrim(COALESCE(_whatsapp, '')), ''),
          'admin', 'active', now(), _uid);

  INSERT INTO public.clinic_units (owner_id, name, is_default, active)
  VALUES (_uid, COALESCE(NULLIF(btrim(COALESCE(_cidade, '')), ''), 'Consultório'), true, true)
  RETURNING id INTO _unidade;

  -- Domingo (0) e sábado (6) fechados; seg a sex, 9h às 18h. A pessoa ajusta
  -- em Configurações, e o "Primeiros passos" leva até lá.
  INSERT INTO public.clinic_business_hours (owner_id, unit_id, weekday, modo, opens_at, closes_at)
  SELECT _uid, _unidade, d,
         CASE WHEN d BETWEEN 1 AND 5 THEN 'aberto' ELSE 'fechado' END,
         CASE WHEN d BETWEEN 1 AND 5 THEN time '09:00' END,
         CASE WHEN d BETWEEN 1 AND 5 THEN time '18:00' END
  FROM generate_series(0, 6) AS d;

  INSERT INTO public.financial_accounts (owner_id, unit_id, name, type)
  VALUES (_uid, _unidade, 'Caixa do consultório', 'cash');

  INSERT INTO public.financial_categories (owner_id, name, type)
  SELECT _uid, n, 'expense'
  FROM unnest(ARRAY[
    'Água', 'Alimentação', 'Aluguel', 'Anúncios', 'Contador', 'Energia',
    'Equipamentos', 'Impostos', 'Insumos e materiais', 'Internet e Telefone',
    'Juros', 'Laboratório e terceiros', 'Limpeza', 'Material de Consumo', 'Móveis',
    'Salários e Pró-labore', 'Manutenção', 'Software e Assinaturas',
    'Taxas de Operação'
  ]) AS n;

  INSERT INTO public.funnel_stages (owner_id, name, position, color)
  VALUES (_uid, 'Primeiro Contato', 0, '#FF7A59');

  INSERT INTO public.whatsapp_send_settings (owner_id) VALUES (_uid)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.ai_agents (owner_id, name, enabled) VALUES (_uid, 'Luna', false);

  IF _convite IS NOT NULL THEN
    UPDATE public.convites_de_consultorio
    SET usado_em = now(), usado_por = _uid
    WHERE id = c.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'owner_id', _uid);
END;
$function$;
