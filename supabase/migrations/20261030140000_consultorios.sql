-- Consultórios como conta: ficha, plano, painel da plataforma e criação.
--
-- ── O desenho ────────────────────────────────────────────────────────────
--
-- O `owner_id` continua sendo o consultório: tudo no banco já é separado por
-- ele. `clinicas` só dá nome, plano e situação a cada `owner_id`. Quem cria um
-- consultório vira o dono dele: `owner_id` = id do login de quem criou, como
-- é na NÓS desde o começo.
--
-- Quem escreve em `clinicas` é sempre o servidor (chave de serviço) ou a
-- função `criar_clinica`. O consultório só LÊ a própria ficha: plano, teste e
-- franquia não são coisas que ele mesmo muda.

-- ── Quem administra a plataforma ─────────────────────────────────────────
-- Fechada para todo mundo logado: só a chave de serviço lê e grava. Quem
-- entra aqui é cadastrado à mão, uma vez.
CREATE TABLE IF NOT EXISTS public.plataforma_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plataforma_admins ENABLE ROW LEVEL SECURITY;

-- ── A ficha do consultório ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinicas (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cidade text,
  whatsapp text,
  plano text NOT NULL DEFAULT 'ia' CHECK (plano IN ('basico', 'ia')),
  situacao text NOT NULL DEFAULT 'teste' CHECK (situacao IN ('teste', 'ativa', 'suspensa')),
  teste_ate timestamptz,
  -- Quem faz a avaliação (na NÓS, a Dra. Mariane). A assistente fala dela.
  responsavel_avaliacao text,
  club_ligado boolean NOT NULL DEFAULT false,
  -- Proteção, não cobrança: conversas da assistente por mês. Passou disso e
  -- sem saldo extra, a assistente passa as conversas novas para a equipe.
  franquia_conversas_mes integer NOT NULL DEFAULT 1000 CHECK (franquia_conversas_mes >= 0),
  -- Pacotes comprados à parte. Não vence no fim do mês.
  conversas_extras integer NOT NULL DEFAULT 0 CHECK (conversas_extras >= 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clinicas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinicas_leitura ON public.clinicas;
CREATE POLICY clinicas_leitura ON public.clinicas
  FOR SELECT TO authenticated USING (public.can_access_row(owner_id));

-- ── Pacotes extras de conversas ──────────────────────────────────────────
-- Lançados por quem administra a plataforma, depois de receber (Pix). O
-- registro responde "quem comprou, quando, quanto" depois.
CREATE TABLE IF NOT EXISTS public.clinica_pacotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.clinicas(owner_id) ON DELETE CASCADE,
  conversas integer NOT NULL CHECK (conversas > 0),
  valor_centavos integer CHECK (valor_centavos >= 0),
  observacao text,
  lancado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinica_pacotes_owner ON public.clinica_pacotes (owner_id, criado_em DESC);
ALTER TABLE public.clinica_pacotes ENABLE ROW LEVEL SECURITY;

-- ── Convite para criar um consultório ────────────────────────────────────
-- Diferente de `clinic_invites` (entrar na equipe de um consultório que já
-- existe): este cria um consultório NOVO, e quem aceita vira o dono. O plano
-- e o teste já vêm definidos por quem convidou. Fechada: só o servidor lê.
CREATE TABLE IF NOT EXISTS public.convites_de_consultorio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  nome_consultorio text NOT NULL,
  email text,
  plano text NOT NULL DEFAULT 'ia' CHECK (plano IN ('basico', 'ia')),
  dias_de_teste integer NOT NULL DEFAULT 14 CHECK (dias_de_teste >= 0),
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  usado_em timestamptz,
  usado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revogado_em timestamptz
);
ALTER TABLE public.convites_de_consultorio ENABLE ROW LEVEL SECURITY;

-- ── A NÓS entra preenchida ───────────────────────────────────────────────
-- Hoje só existe ela. Plano com IA, ativa, Club ligado (é quem tem
-- `club_config`), sem fim de teste.
INSERT INTO public.clinicas (owner_id, nome, plano, situacao, responsavel_avaliacao, club_ligado)
SELECT m.owner_id, 'NÓS Odontologia', 'ia', 'ativa', 'Dra. Mariane',
       EXISTS (SELECT 1 FROM public.club_config c WHERE c.owner_id = m.owner_id)
FROM (SELECT DISTINCT owner_id FROM public.clinic_members) m
ON CONFLICT (owner_id) DO NOTHING;

-- O nome padrão da assistente deixa de ser da NÓS. A da NÓS já tem o dela.
ALTER TABLE public.ai_agents ALTER COLUMN name SET DEFAULT 'Luna';

-- ── Criar um consultório ─────────────────────────────────────────────────
--
-- Para um login sem consultório nenhum. Cria tudo o que o sistema precisa
-- para abrir sem tela de erro: a ficha, o acesso de administrador, uma
-- unidade, os horários (seg a sex, 9h às 18h), um caixa, as categorias do
-- financeiro, a primeira etapa do funil, o limite diário de envio e a
-- assistente DESLIGADA.
--
-- Por enquanto só com convite (`_convite`): o cadastro aberto, pela página de
-- vendas, entra quando o resto (plano, limites, onboarding) estiver pronto.
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

  IF _convite IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cadastro_fechado');
  END IF;

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

  UPDATE public.convites_de_consultorio
  SET usado_em = now(), usado_por = _uid
  WHERE id = c.id;

  RETURN jsonb_build_object('ok', true, 'owner_id', _uid);
END;
$function$;

REVOKE ALL ON FUNCTION public.criar_clinica(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_clinica(text, text, text, text) TO authenticated;

-- ── Os números do painel da plataforma ───────────────────────────────────
-- Uma linha por consultório: pessoas com acesso, situação do WhatsApp,
-- conversas que a assistente respondeu desde `_desde` (o começo do mês) e os
-- tokens gastos por modelo (o custo em dólar é calculado no servidor, com o
-- preço do modelo). Só a chave de serviço chama: o painel passa pelo servidor,
-- que confere antes se quem pediu é da plataforma.
CREATE OR REPLACE FUNCTION public.plataforma_resumo(_desde timestamptz)
RETURNS TABLE (
  owner_id uuid,
  pessoas integer,
  whatsapp_status text,
  whatsapp_numero text,
  conversas integer,
  uso jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.owner_id,
    (SELECT count(*)::int FROM public.clinic_members m
      WHERE m.owner_id = c.owner_id AND m.status = 'active'),
    (SELECT i.status FROM public.wa_instances i
      WHERE i.owner_id = c.owner_id ORDER BY i.created_at LIMIT 1),
    (SELECT i.phone_e164 FROM public.wa_instances i
      WHERE i.owner_id = c.owner_id ORDER BY i.created_at LIMIT 1),
    (SELECT count(DISTINCT a.session_id)::int FROM public.ai_agent_messages a
      WHERE a.owner_id = c.owner_id AND a.direction = 'saida' AND a.created_at >= _desde),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'modelo', u.modelo, 'entrada', u.entrada, 'cache', u.cache, 'saida', u.saida))
      FROM (
        SELECT modelo,
               sum(tokens_entrada)::bigint AS entrada,
               sum(COALESCE(tokens_cache, 0))::bigint AS cache,
               sum(tokens_saida)::bigint AS saida
        FROM public.ai_uso
        WHERE ai_uso.owner_id = c.owner_id AND quando >= _desde
        GROUP BY modelo
      ) u
    ), '[]'::jsonb)
  FROM public.clinicas c
$function$;

REVOKE ALL ON FUNCTION public.plataforma_resumo(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plataforma_resumo(timestamptz) TO service_role;
