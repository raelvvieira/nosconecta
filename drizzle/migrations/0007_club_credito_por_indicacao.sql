-- Crédito por indicação e crédito de boas-vindas.
--
-- ── A regra nova, nas palavras da clínica ────────────────────────────────
--
-- "toda nova conta já começa com R$100 de crédito pra ser utilizado" e "a cada
-- nova indicação que a pessoa faz e ela comparece, ganha mais 100 de crédito".
--
-- Até aqui o crédito só aparecia ao SUBIR DE NÍVEL. Agora há três origens, e
-- elas convivem: boas-vindas (uma vez), indicação confirmada (cada uma), e o
-- bônus do nível (uma vez por nível).
--
-- ── Por que os valores ficam em tabela ───────────────────────────────────
--
-- Pelo mesmo motivo da régua de níveis: são valores comerciais. R$ 100 por
-- indicação numa base que indica muito é uma conta que cresce rápido, e a
-- clínica precisa poder mudar isso numa tarde, sem deploy.
CREATE TABLE IF NOT EXISTS public.club_config (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Quanto entra quando uma indicação é confirmada.
  credito_por_indicacao numeric(12, 2) NOT NULL DEFAULT 100,
  -- Quanto entra quando a pessoa cria a conta pelo cartão.
  credito_boas_vindas numeric(12, 2) NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_config_valores_nao_negativos
    CHECK (credito_por_indicacao >= 0 AND credito_boas_vindas >= 0)
);

ALTER TABLE public.club_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS club_config_acesso ON public.club_config;
CREATE POLICY club_config_acesso ON public.club_config
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));
GRANT SELECT, INSERT, UPDATE ON public.club_config TO authenticated;

COMMENT ON TABLE public.club_config IS
  'Os valores em dinheiro do NÓS Club que não são de nível: crédito por indicação confirmada e crédito de boas-vindas.';

INSERT INTO public.club_config (owner_id)
SELECT DISTINCT owner_id FROM public.patients WHERE owner_id IS NOT NULL
ON CONFLICT (owner_id) DO NOTHING;

-- ── A trava contra pagar a mesma indicação duas vezes ────────────────────
--
-- O crédito de nível tem a dele (uma linha por nível, por pessoa). O crédito
-- por indicação precisa da sua: a indicação que vai e volta de confirmada —
-- correção de engano, atendimento reaberto — não pode render R$ 100 a cada
-- ida.
ALTER TABLE public.club_creditos
  ADD COLUMN IF NOT EXISTS indicacao_id uuid REFERENCES public.club_indicacoes(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS club_creditos_uma_por_indicacao
  ON public.club_creditos (indicacao_id)
  WHERE indicacao_id IS NOT NULL;

COMMENT ON COLUMN public.club_creditos.indicacao_id IS
  'A indicação que gerou este crédito. O índice único sobre ela é o que impede a mesma indicação de pagar duas vezes.';

-- `indicacao` entra na lista de tipos. O CHECK antigo sai e volta com ele —
-- não há `ALTER CONSTRAINT` para isso.
ALTER TABLE public.club_creditos
  DROP CONSTRAINT IF EXISTS club_creditos_tipo_valido;
ALTER TABLE public.club_creditos
  ADD CONSTRAINT club_creditos_tipo_valido
  CHECK (tipo IN ('nivel', 'indicacao', 'boas_vindas', 'uso', 'ajuste'));

-- Boas-vindas é uma vez por pessoa, e não uma por visita ao cartão.
CREATE UNIQUE INDEX IF NOT EXISTS club_creditos_boas_vindas_unica
  ON public.club_creditos (owner_id, patient_id)
  WHERE tipo = 'boas_vindas';

-- ── O painel do paciente passa a explicar a regra ────────────────────────
--
-- A tela dele diz "cada indicação confirmada vale R$ X". Esse X é o da
-- configuração — mandar a tela cravar "100" faria a explicação mentir no dia
-- em que a clínica mudasse o valor, e mentir sobre dinheiro para quem está
-- juntando crédito é a pior forma de perder um programa de relacionamento.
CREATE OR REPLACE FUNCTION public.club_meu_painel()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  p public.patients%ROWTYPE;
  _quantos int;
  _confirmadas int;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_sessao');
  END IF;

  SELECT * INTO p FROM public.patients WHERE club_user_id = _uid LIMIT 1;

  IF NOT FOUND THEN
    SELECT email INTO _email FROM auth.users WHERE id = _uid;
    IF _email IS NULL OR btrim(_email) = '' THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'sem_cadastro');
    END IF;

    SELECT count(*) INTO _quantos
    FROM public.patients
    WHERE lower(btrim(coalesce(email, ''))) = lower(btrim(_email))
      AND club_user_id IS NULL;

    IF _quantos = 0 THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'sem_cadastro');
    ELSIF _quantos > 1 THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'ambiguo');
    END IF;

    UPDATE public.patients
    SET club_user_id = _uid,
        club_desde = coalesce(club_desde, now()),
        updated_at = now()
    WHERE lower(btrim(coalesce(email, ''))) = lower(btrim(_email))
      AND club_user_id IS NULL
    RETURNING * INTO p;
  END IF;

  IF p.club_desde IS NULL THEN
    UPDATE public.patients SET club_desde = now(), updated_at = now()
    WHERE id = p.id
    RETURNING * INTO p;
  END IF;

  SELECT count(*) INTO _confirmadas
  FROM public.club_indicacoes
  WHERE indicador_id = p.id AND status = 'confirmada';

  RETURN jsonb_build_object(
    'ok', true,
    'nome', p.name,
    'desde', p.club_desde,
    'confirmadas', _confirmadas,
    'por_indicacao', coalesce(
      (SELECT c.credito_por_indicacao FROM public.club_config c WHERE c.owner_id = p.owner_id),
      100
    ),
    'regua', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'nome', n.nome, 'indicacoes', n.indicacoes, 'credito', n.credito
      ) ORDER BY n.indicacoes)
      FROM public.club_niveis n
      WHERE n.owner_id = p.owner_id AND n.ativo
    ), '[]'::jsonb),
    'indicacoes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'nome', i.indicado_nome,
        'status', i.status,
        'quando', i.created_at
      ) ORDER BY i.created_at DESC)
      FROM public.club_indicacoes i
      WHERE i.indicador_id = p.id AND i.status <> 'cancelada'
    ), '[]'::jsonb),
    'extrato', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'valor', c.valor, 'descricao', c.descricao, 'quando', c.created_at
      ) ORDER BY c.created_at DESC)
      FROM public.club_creditos c
      WHERE c.patient_id = p.id
    ), '[]'::jsonb),
    'saldo', coalesce((
      SELECT sum(c.valor) FROM public.club_creditos c WHERE c.patient_id = p.id
    ), 0)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.club_meu_painel() FROM public;
GRANT EXECUTE ON FUNCTION public.club_meu_painel() TO authenticated;
