-- NÓS Club: todo membro recebe os créditos de boas-vindas ao abrir o painel.
--
-- Pedido da clínica em 23/10: quem faz o primeiro acesso já entra com R$ 100.
-- O crédito já era lançado na criação da conta, mas só ali: a conta criada
-- antes dessa regra, a ligada pelo e-mail e a que teve a gravação falhando
-- ficavam sem nada — em 23/10, o único membro com conta estava sem crédito.
-- O valor continua vindo de `club_config.credito_boas_vindas` (R$ 100 hoje).

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

  -- Boas-vindas na primeira vez que a pessoa abre o painel — e em toda
  -- abertura seguinte para quem ainda não recebeu. Aqui, e não só na criação
  -- da conta, porque é o único ponto por onde TODO membro passa: quem criou a
  -- conta antes desta regra, quem foi ligado pelo e-mail, e quem teve a
  -- gravação da criação falhando calada. O índice único por paciente faz a
  -- segunda tentativa não fazer nada.
  INSERT INTO public.club_creditos (owner_id, patient_id, valor, tipo, descricao)
  SELECT p.owner_id, p.id, v.valor, 'boas_vindas', 'Boas-vindas ao NÓS Club'
  FROM (
    SELECT coalesce(
      (SELECT c.credito_boas_vindas FROM public.club_config c WHERE c.owner_id = p.owner_id),
      100
    ) AS valor
  ) v
  WHERE v.valor > 0
  ON CONFLICT (owner_id, patient_id) WHERE tipo = 'boas_vindas' DO NOTHING;

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
    'link_do_cartao', (
      SELECT nullif(btrim(coalesce(c.link_do_cartao, '')), '')
      FROM public.club_config c WHERE c.owner_id = p.owner_id
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
