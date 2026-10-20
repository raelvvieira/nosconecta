-- Uma área só para as pessoas: acesso, ficha clínica, unidades e convites.
--
-- ── O que estava confuso ─────────────────────────────────────────────────
--
-- Configurações tinha "Profissionais" e "Usuários e permissões", duas listas
-- para as mesmas pessoas. A Dra. Mariane aparecia três vezes: uma como
-- profissional (com CRO, cor na agenda e 100 consultas) e duas como usuária —
-- uma linha ativa SEM login nenhum e outra, com o login de verdade,
-- desativada. Ou seja: a dona da clínica estava sem acesso ao próprio sistema
-- desde 02/09, e a tela não tinha como mostrar isso.
--
-- As duas tabelas continuam separadas, e de propósito: `professionals` é a
-- identidade clínica (é a ela que os agendamentos apontam) e `clinic_members`
-- é o acesso. Juntar as duas apagaria o histórico da agenda. O que faltava era
-- o VÍNCULO entre elas — e é ele que permite uma tela só.

-- ── 1. A ficha clínica da pessoa que tem acesso ──────────────────────────
--
-- `SET NULL`: tirar alguém do quadro clínico não pode apagar o acesso dela, e
-- apagar a ficha não pode derrubar o login.
ALTER TABLE public.clinic_members
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL;

-- Uma ficha clínica pertence a uma pessoa só. Sem isto, dois acessos poderiam
-- apontar para o mesmo profissional e a agenda não saberia de quem é a cadeira.
CREATE UNIQUE INDEX IF NOT EXISTS clinic_members_profissional_unico
  ON public.clinic_members (professional_id)
  WHERE professional_id IS NOT NULL;

COMMENT ON COLUMN public.clinic_members.professional_id IS
  'A ficha em professionals desta pessoa, quando ela atende pacientes. Nula para quem só usa o sistema.';

-- A coluna que nunca foi lida.
COMMENT ON COLUMN public.clinic_members.permissions IS
  'Histórico. Nenhuma linha do app lê esta coluna desde 20/10: quem decide o que cada pessoa vê é o nível (role), pelo mapa em src/lib/auth/niveis-de-acesso.ts.';

-- ── 2. Mais de uma unidade por pessoa ────────────────────────────────────
--
-- `clinic_members.unit_id` é uma unidade só, e a clínica tem duas. Quem atende
-- nas duas ficava preso a uma — ou virava administrador só para enxergar o
-- resto, que é como se perde o controle de acesso.
--
-- A coluna antiga CONTINUA, como unidade principal: é ela que
-- `current_unit_id()` devolve, e é o padrão de `resolveUnitId` quando um
-- cadastro nasce sem unidade escolhida. A tabela nova diz o que a pessoa
-- ALCANÇA; a coluna diz onde ela trabalha por padrão.
CREATE TABLE IF NOT EXISTS public.clinic_member_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.clinic_members(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clinic_member_units_sem_repetir
  ON public.clinic_member_units (member_id, unit_id);
CREATE INDEX IF NOT EXISTS clinic_member_units_do_dono
  ON public.clinic_member_units (owner_id, unit_id);

ALTER TABLE public.clinic_member_units ENABLE ROW LEVEL SECURITY;

-- Leitura para a própria clínica; escrita só para administrador. Quem não é
-- admin não pode se dar uma unidade a mais — seria furar o próprio limite.
DROP POLICY IF EXISTS clinic_member_units_leitura ON public.clinic_member_units;
CREATE POLICY clinic_member_units_leitura ON public.clinic_member_units
  FOR SELECT USING (public.can_access_row(owner_id));

DROP POLICY IF EXISTS clinic_member_units_escrita ON public.clinic_member_units;
CREATE POLICY clinic_member_units_escrita ON public.clinic_member_units
  FOR ALL USING (public.can_access_row(owner_id) AND public.is_clinic_admin())
  WITH CHECK (public.can_access_row(owner_id) AND public.is_clinic_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_member_units TO authenticated;

COMMENT ON TABLE public.clinic_member_units IS
  'As unidades que cada pessoa alcança. clinic_members.unit_id segue valendo como unidade principal (padrão de cadastro novo e de current_unit_id).';

-- Quem já estava cadastrado continua exatamente com o que tinha.
INSERT INTO public.clinic_member_units (owner_id, member_id, unit_id)
SELECT m.owner_id, m.id, m.unit_id
FROM public.clinic_members m
WHERE m.unit_id IS NOT NULL
ON CONFLICT (member_id, unit_id) DO NOTHING;

-- ── 3. A RLS passa a enxergar as unidades da pessoa ──────────────────────
--
-- Uma função só, usada por 19 políticas (agendamentos, pacientes, prontuário,
-- financeiro, cadeiras...). Trocar o corpo dela muda as 19 de uma vez — e é
-- por isso que a tabela nova não exigiu reescrever política nenhuma.
--
-- A unidade principal continua valendo mesmo sem linha na tabela nova: é o que
-- garante que ninguém perca acesso se o backfill acima não tiver rodado.
CREATE OR REPLACE FUNCTION public.can_access_row(_owner_id uuid, _unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _owner_id = public.current_owner_id()
    AND (
      public.is_clinic_admin()
      OR _unit_id = public.current_unit_id()
      OR EXISTS (
        SELECT 1
        FROM public.clinic_member_units mu
        JOIN public.clinic_members m ON m.id = mu.member_id
        WHERE m.user_id = auth.uid()
          AND m.status = 'active'
          AND mu.unit_id = _unit_id
      )
    )
$function$;

-- ── 4. Os convites ───────────────────────────────────────────────────────
--
-- Pedido da clínica em 20/10: o administrador manda um link que JÁ CARREGA o
-- nível, e quem recebe preenche os próprios dados e entra direto, sem fila de
-- aprovação.
--
-- O nível vem no convite, e não na mão de quem se cadastra, porque é o único
-- jeito de "entrar já no nível certo" não virar "escolher o próprio nível".
CREATE TABLE IF NOT EXISTS public.clinic_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- O segredo do link. Quem o tem, tem o convite — como qualquer link de
  -- convite. Por isso o prazo curto e o uso único logo abaixo.
  token text NOT NULL UNIQUE,
  role text NOT NULL,
  -- Só para a tela do administrador saber de quem era o convite. Não trava
  -- nada: quem abrir o link pode se cadastrar com outro e-mail.
  convidado_nome text,
  convidado_email text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  CONSTRAINT clinic_invites_role_valido
    CHECK (role IN ('admin', 'reception', 'dentist', 'finance'))
);

CREATE INDEX IF NOT EXISTS clinic_invites_do_dono
  ON public.clinic_invites (owner_id, created_at DESC);

ALTER TABLE public.clinic_invites ENABLE ROW LEVEL SECURITY;

-- Só administrador vê e cria convite. Quem recebe o link NÃO lê esta tabela:
-- passa pelas duas funções abaixo, que são SECURITY DEFINER e entregam só o
-- necessário.
DROP POLICY IF EXISTS clinic_invites_admin ON public.clinic_invites;
CREATE POLICY clinic_invites_admin ON public.clinic_invites
  FOR ALL USING (public.can_access_row(owner_id) AND public.is_clinic_admin())
  WITH CHECK (public.can_access_row(owner_id) AND public.is_clinic_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_invites TO authenticated;

COMMENT ON TABLE public.clinic_invites IS
  'Convites de acesso. O nível (role) é definido por quem convida; quem aceita só informa os próprios dados. Uso único, com prazo.';

-- O que a página do convite pode saber ANTES de alguém se cadastrar: se o
-- convite vale, para qual nível, e as unidades da clínica para escolher.
-- Nada de owner_id, nada de quem convidou, nada do resto da tabela.
CREATE OR REPLACE FUNCTION public.convite_para_mostrar(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'ok', true,
        'nivel', c.role,
        'convidado_nome', c.convidado_nome,
        'unidades', COALESCE(
          (
            SELECT jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.name) ORDER BY u.is_default DESC, u.name)
            FROM public.clinic_units u
            WHERE u.owner_id = c.owner_id AND u.active
          ),
          '[]'::jsonb
        )
      )
      FROM public.clinic_invites c
      WHERE c.token = _token
        AND c.used_at IS NULL
        AND c.revoked_at IS NULL
        AND c.expires_at > now()
    ),
    jsonb_build_object('ok', false)
  )
$function$;

REVOKE ALL ON FUNCTION public.convite_para_mostrar(text) FROM public;
GRANT EXECUTE ON FUNCTION public.convite_para_mostrar(text) TO anon, authenticated;

-- E o aceite: roda com a sessão de quem acabou de criar a conta.
--
-- SECURITY DEFINER porque a linha que nasce aqui é `active` e tem nível — uma
-- política que permitisse isso ao próprio usuário seria a política que permite
-- a qualquer um se tornar administrador. Aqui o nível vem do convite, lido do
-- banco, e o `_token` é a única coisa que quem chama controla.
CREATE OR REPLACE FUNCTION public.aceitar_convite(
  _token text,
  _nome text,
  _telefone text,
  _unidades uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.clinic_invites%ROWTYPE;
  _uid uuid := auth.uid();
  _email text;
  _novo uuid;
  _principal uuid;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_sessao');
  END IF;

  SELECT * INTO c
  FROM public.clinic_invites
  WHERE token = _token
    AND used_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  -- Trava a linha: dois cliques no mesmo link, de duas abas, não podem criar
  -- dois acessos com o mesmo convite.
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'convite_invalido');
  END IF;

  IF EXISTS (SELECT 1 FROM public.clinic_members WHERE user_id = _uid) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_tem_acesso');
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  -- A unidade principal é a primeira das escolhidas que existe NA CLÍNICA do
  -- convite. Quem é administrador fica sem unidade principal, como já era:
  -- `null` ali significa "enxerga a clínica inteira".
  SELECT u.id INTO _principal
  FROM public.clinic_units u
  WHERE u.owner_id = c.owner_id AND u.active AND u.id = ANY(_unidades)
  ORDER BY u.is_default DESC, u.name
  LIMIT 1;

  INSERT INTO public.clinic_members (
    owner_id, user_id, name, email, phone, role, status,
    unit_id, approved_at, approved_by
  )
  VALUES (
    c.owner_id, _uid, COALESCE(NULLIF(btrim(_nome), ''), _email), _email,
    NULLIF(btrim(_telefone), ''), c.role, 'active',
    CASE WHEN c.role = 'admin' THEN NULL ELSE _principal END,
    now(), c.created_by
  )
  RETURNING id INTO _novo;

  -- Só unidades da clínica do convite. Um id de outra clínica vindo no array
  -- simplesmente não casa — e é por isso que o filtro é por `owner_id` aqui
  -- dentro, e não confiando no que veio.
  INSERT INTO public.clinic_member_units (owner_id, member_id, unit_id)
  SELECT c.owner_id, _novo, u.id
  FROM public.clinic_units u
  WHERE u.owner_id = c.owner_id AND u.active AND u.id = ANY(_unidades)
  ON CONFLICT (member_id, unit_id) DO NOTHING;

  UPDATE public.clinic_invites
  SET used_at = now(), used_by = _uid
  WHERE id = c.id;

  RETURN jsonb_build_object('ok', true, 'nivel', c.role);
END;
$function$;

REVOKE ALL ON FUNCTION public.aceitar_convite(text, text, text, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.aceitar_convite(text, text, text, uuid[]) TO authenticated;
