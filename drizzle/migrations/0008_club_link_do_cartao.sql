-- O endereço que vai impresso no cartão.
--
-- ── Por que ele precisa ser escolhido, e não deduzido ────────────────────
--
-- Até agora o QR Code e o link da mensagem de convite saíam de
-- `window.location.origin` — o endereço por onde a pessoa abriu o sistema.
-- Isso funciona na tela e é uma armadilha no plástico: quem gera o QR dentro
-- do editor do Lovable leva o endereço de PRÉVIA para a gráfica, e prévia
-- muda. Mil cartões com um endereço que morre não têm conserto.
--
-- Com o endereço guardado aqui, o QR e a mensagem saem sempre do mesmo lugar,
-- não importa por onde a clínica abriu o sistema — inclusive ANTES de o
-- domínio definitivo estar no ar, que é quando o cartão costuma ser
-- encomendado.
ALTER TABLE public.club_config
  ADD COLUMN IF NOT EXISTS link_do_cartao text;

COMMENT ON COLUMN public.club_config.link_do_cartao IS
  'O endereço do site que vai no QR Code do cartão e no link da mensagem de convite, sem barra no fim. Vazio = usa o endereço por onde o sistema foi aberto.';

-- O painel do paciente passa a devolver o link, para a mensagem de convite
-- dele sair com o endereço definitivo em vez do endereço por onde ele abriu.
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
