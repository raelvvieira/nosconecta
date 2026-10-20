-- A área do paciente: o QR Code do cartão, o login e o painel dele.
--
-- ── O problema de acesso, que é o coração disto ──────────────────────────
--
-- Todo acesso ao sistema hoje passa por `clinic_members`: `current_owner_id()`
-- lê aquela tabela, e TODA política de RLS pergunta por ela. Um paciente não
-- tem linha lá — e não pode ter, porque ter uma linha ali é ser da equipe.
--
-- Dar acesso de tabela ao paciente exigiria escrever políticas novas em
-- `patients`, `club_indicacoes` e `club_creditos`, cada uma com um "ou é o
-- próprio paciente" — três superfícies novas para errar, numa base que guarda
-- prontuário, telefone e endereço de todo mundo.
--
-- Então o paciente não lê tabela nenhuma. Ele tem UMA função, que devolve o
-- painel dele já pronto, e nada mais existe para ele. É a menor superfície
-- possível: um retorno em JSON, montado aqui dentro, sem GRANT em tabela.
--
-- ── Como a conta encontra a ficha ────────────────────────────────────────
--
-- Pelo e-mail. A pessoa cria a conta com o mesmo e-mail que está na ficha
-- dela, o Supabase confirma esse e-mail (é preciso ter a caixa de entrada), e
-- a função liga as duas. Dois pacientes com o mesmo e-mail cadastrado não
-- ligam nada: é ambíguo, e adivinhar aqui seria mostrar o crédito de um para
-- o outro.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS club_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Uma conta pertence a uma ficha só.
CREATE UNIQUE INDEX IF NOT EXISTS patients_club_user_unico
  ON public.patients (club_user_id)
  WHERE club_user_id IS NOT NULL;

COMMENT ON COLUMN public.patients.club_user_id IS
  'A conta de login do próprio paciente, criada pelo QR Code do cartão do NÓS Club. Não dá acesso a tabela nenhuma: só à função club_meu_painel().';

-- ── O painel do paciente ─────────────────────────────────────────────────
--
-- Faz três coisas, nesta ordem: liga a conta à ficha (na primeira vez), entra
-- no Club (idem), e devolve o que a tela mostra.
--
-- Entrar no Club no primeiro acesso é de propósito: o cartão na mão da pessoa
-- É o convite, e exigir que alguém da clínica marque "participa" depois de já
-- ter entregue o cartão é a diferença entre o programa rodar e o programa
-- morrer no balcão. Entrar não dá crédito nenhum — crédito vem de indicação
-- confirmada, ou de um lançamento que a clínica faz.
CREATE OR REPLACE FUNCTION public.club_meu_painel()
RETURNS jsonb
LANGUAGE plpgsql
-- VOLATILE (o padrão), e não STABLE: a função GRAVA na primeira visita — liga
-- a conta à ficha e entra no Club. Marcada como STABLE, o Postgres recusaria o
-- UPDATE em tempo de execução, e só na primeira pessoa que lesse o cartão.
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

    -- Quantas fichas têm este e-mail? Uma, liga. Nenhuma, a pessoa não é
    -- paciente (ou usou outro e-mail). Duas, ninguém liga nada.
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

  -- Já ligada, mas ainda fora do Club (ficha criada antes do programa): o
  -- primeiro acesso pelo cartão entra.
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
    -- A régua inteira vai junto: é dela que a tela tira o nível, o próximo e
    -- quanto falta, com a MESMA conta que a tela da clínica usa
    -- (`niveis-do-club.ts`). Duas contas para o mesmo número divergiriam, e
    -- aqui a divergência apareceria para a paciente.
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

-- `anon` fica de fora: sem sessão a função só devolveria "sem_sessao", e não
-- há por que deixar o endpoint aberto para isso.
REVOKE ALL ON FUNCTION public.club_meu_painel() FROM public;
GRANT EXECUTE ON FUNCTION public.club_meu_painel() TO authenticated;

COMMENT ON FUNCTION public.club_meu_painel() IS
  'Tudo o que a área do paciente mostra, em uma chamada. É a ÚNICA porta de dados do paciente: ele não tem GRANT em tabela nenhuma.';
