-- O cadastro aberto: "Testar 14 dias grátis", pela página de vendas.
--
-- A `criar_clinica` nasceu só com convite (etapa 2). Com o plano, a franquia
-- e o onboarding prontos (etapas 3 a 5), quem chega pela página de vendas cria
-- o próprio consultório em `/comecar`, com 14 dias de teste do plano com IA.
-- Com convite, segue valendo o plano e o teste que a plataforma escolheu.

CREATE OR REPLACE FUNCTION public.criar_clinica(
  _nome text,
  _cidade text DEFAULT NULL,
  _whatsapp text DEFAULT NULL,
  _convite text DEFAULT NULL
)
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
    'Equipamentos', 'Impostos', 'Insumos Odontológicos', 'Internet e Telefone',
    'Juros', 'Laboratório', 'Limpeza', 'Material de Consumo', 'Móveis',
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

REVOKE ALL ON FUNCTION public.criar_clinica(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_clinica(text, text, text, text) TO authenticated;
