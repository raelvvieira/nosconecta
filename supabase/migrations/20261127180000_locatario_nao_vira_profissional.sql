-- Quem aceita um convite de Locatário não ganha ficha de profissional, mesmo que
-- a tela mande "atendo pacientes": ele apareceria na agenda da clínica.
CREATE OR REPLACE FUNCTION public.aceitar_convite(_token text, _nome text, _telefone text, _unidades uuid[], _atende boolean DEFAULT false, _cro text DEFAULT NULL::text, _especialidades text[] DEFAULT '{}'::text[], _cor text DEFAULT NULL::text)
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
  _ficha uuid;
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

  -- A ficha clínica, quando a pessoa disse que atende.
  --
  -- A comissão NÃO entra aqui: nasce em zero e quem define é a clínica, na
  -- tela Pessoal. É combinação comercial, não dado de quem se cadastra.
  -- O locatário nunca vira profissional da clínica: ele não entra na agenda dela.
  IF _atende AND c.role <> 'tenant' THEN
    INSERT INTO public.professionals (
      owner_id, unit_id, name, specialty, specialties,
      registration_number, phone, email, color, commission_pct, active
    )
    VALUES (
      c.owner_id,
      COALESCE(_principal, (
        SELECT u.id FROM public.clinic_units u
        WHERE u.owner_id = c.owner_id AND u.active
        ORDER BY u.is_default DESC, u.name LIMIT 1
      )),
      COALESCE(NULLIF(btrim(_nome), ''), _email),
      NULLIF(array_to_string(COALESCE(_especialidades, '{}'), ' · '), ''),
      COALESCE(_especialidades, '{}'),
      NULLIF(btrim(COALESCE(_cro, '')), ''),
      NULLIF(btrim(COALESCE(_telefone, '')), ''),
      _email,
      COALESCE(NULLIF(btrim(COALESCE(_cor, '')), ''), '#8B5CF6'),
      0,
      true
    )
    RETURNING id INTO _ficha;
  END IF;

  INSERT INTO public.clinic_members (
    owner_id, user_id, name, email, phone, role, status,
    unit_id, professional_id, approved_at, approved_by
  )
  VALUES (
    c.owner_id, _uid, COALESCE(NULLIF(btrim(_nome), ''), _email), _email,
    NULLIF(btrim(_telefone), ''), c.role, 'active',
    CASE WHEN c.role = 'admin' THEN NULL ELSE _principal END,
    _ficha,
    now(), c.created_by
  )
  RETURNING id INTO _novo;

  -- Acessos personalizados que o administrador marcou ao gerar o convite.
  UPDATE public.clinic_members
  SET acessos_extras = COALESCE(c.acessos_extras, '{}')
  WHERE id = _novo;

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

  RETURN jsonb_build_object('ok', true, 'nivel', c.role, 'ficha', _ficha IS NOT NULL);
END;
$function$
;
