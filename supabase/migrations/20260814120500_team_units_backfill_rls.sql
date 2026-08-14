-- Backfill + travamento de unit_id + reescrita de RLS.
--
-- ESTE é o ponto de não-retorno: a partir daqui, qualquer código que ainda
-- grave/leia com `owner_id = auth.uid()` puro (em vez de resolver por
-- `clinic_members`) para de bater com a política. Por isso este arquivo só
-- deve ir para produção junto com o deploy do código que troca
-- `context.userId` por `context.ownerId` — não isoladamente antes dele.
--
-- Ordem interna: (1) cria "Unidade Principal" e a linha de clinic_members de
-- cada dono já existente, com verificação explícita de que nada ficou de
-- fora, (2) só então torna unit_id obrigatório, (3) só então reescreve RLS.

-- ── 1. Backfill ───────────────────────────────────────────────────────────

DO $$
DECLARE v_owner uuid; v_unit uuid;
BEGIN
  FOR v_owner IN SELECT id FROM auth.users LOOP
    -- Uma "Unidade Principal" por dono, se ainda não existir.
    IF NOT EXISTS (SELECT 1 FROM public.clinic_units WHERE owner_id = v_owner AND is_default) THEN
      INSERT INTO public.clinic_units (owner_id, name, is_default) VALUES (v_owner, 'Unidade Principal', true);
    END IF;
    SELECT id INTO v_unit FROM public.clinic_units WHERE owner_id = v_owner AND is_default LIMIT 1;

    UPDATE public.patients               SET unit_id = v_unit WHERE owner_id = v_owner AND unit_id IS NULL;
    UPDATE public.professionals          SET unit_id = v_unit WHERE owner_id = v_owner AND unit_id IS NULL;
    UPDATE public.clinic_chairs          SET unit_id = v_unit WHERE owner_id = v_owner AND unit_id IS NULL;
    UPDATE public.appointments           SET unit_id = v_unit WHERE owner_id = v_owner AND unit_id IS NULL;
    UPDATE public.blocked_times          SET unit_id = v_unit WHERE owner_id = v_owner AND unit_id IS NULL;
    UPDATE public.waiting_list           SET unit_id = v_unit WHERE owner_id = v_owner AND unit_id IS NULL;
    UPDATE public.financial_accounts     SET unit_id = v_unit WHERE owner_id = v_owner AND unit_id IS NULL;
    UPDATE public.financial_transactions SET unit_id = v_unit WHERE owner_id = v_owner AND unit_id IS NULL;

    -- Dono existente vira admin da própria clínica, com a unidade dele fixa.
    -- unit_id = NULL de propósito (admin enxerga todas as unidades por padrão).
    INSERT INTO public.clinic_members (owner_id, user_id, name, email, role, status, permissions, unit_id, active)
    SELECT v_owner, v_owner,
           COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_owner), 'Administrador'),
           COALESCE((SELECT email FROM auth.users WHERE id = v_owner), ''),
           'admin', 'active', '["agenda","patients","finance","settings"]'::jsonb, NULL, true
    WHERE NOT EXISTS (SELECT 1 FROM public.clinic_members WHERE user_id = v_owner);
  END LOOP;
END $$;

-- Rede de segurança: falha alto e claro em vez de deixar uma linha travada
-- sem dono depois do NOT NULL abaixo.
DO $$
DECLARE t TEXT; n INTEGER;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'patients','professionals','clinic_chairs','appointments',
    'blocked_times','waiting_list','financial_accounts','financial_transactions'
  ]) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE unit_id IS NULL', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Backfill de unit_id incompleto em %: % linha(s) sem unidade', t, n;
    END IF;
  END LOOP;
END $$;

-- ── 2. unit_id passa a ser obrigatório ───────────────────────────────────

ALTER TABLE public.patients               ALTER COLUMN unit_id SET NOT NULL;
ALTER TABLE public.professionals          ALTER COLUMN unit_id SET NOT NULL;
ALTER TABLE public.clinic_chairs          ALTER COLUMN unit_id SET NOT NULL;
ALTER TABLE public.appointments           ALTER COLUMN unit_id SET NOT NULL;
ALTER TABLE public.blocked_times          ALTER COLUMN unit_id SET NOT NULL;
ALTER TABLE public.waiting_list           ALTER COLUMN unit_id SET NOT NULL;
ALTER TABLE public.financial_accounts     ALTER COLUMN unit_id SET NOT NULL;
ALTER TABLE public.financial_transactions ALTER COLUMN unit_id SET NOT NULL;

-- ── 3. RLS: tabelas com unidade própria ──────────────────────────────────

DO $$
DECLARE t TEXT; pol RECORD;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'patients','professionals','clinic_chairs','appointments',
    'blocked_times','waiting_list','financial_accounts','financial_transactions'
  ]) LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, t);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_access_row(owner_id, unit_id)) WITH CHECK (public.can_access_row(owner_id, unit_id));',
      t || '_scoped', t
    );
  END LOOP;
END $$;

-- ── 4. RLS: tabelas clínica-inteira (sem unit_id) ────────────────────────

DO $$
DECLARE t TEXT; pol RECORD;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'clinic_procedures','financial_categories','financial_goals','financial_scenarios',
    'crm_credentials','crm_campaign_sends',
    'meta_capi_credentials','meta_capi_triggers','meta_capi_events',
    'push_preferences','push_subscriptions','push_poll_state',
    'pipeline_deals','pipeline_deal_events',
    'whatsapp_broadcasts','whatsapp_broadcast_targets'
  ]) LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, t);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_access_row(owner_id)) WITH CHECK (public.can_access_row(owner_id));',
      t || '_scoped', t
    );
  END LOOP;
END $$;

-- ── 5. RLS: tabelas sem owner_id próprio, escopadas via tabela-pai ───────
-- Mesmo padrão que ledger_entries já usava contra financial_accounts —
-- agora a tabela-pai também carrega unidade, então o encadeamento cobre as
-- duas dimensões de uma vez.

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ledger_entries' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.ledger_entries;', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY ledger_entries_scoped ON public.ledger_entries FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.financial_accounts a
    WHERE a.id = account_id AND public.can_access_row(a.owner_id, a.unit_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.financial_accounts a
    WHERE a.id = account_id AND public.can_access_row(a.owner_id, a.unit_id)
  ));

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='appointment_notifications' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.appointment_notifications;', pol.policyname);
  END LOOP;
END $$;
CREATE POLICY appointment_notifications_scoped ON public.appointment_notifications FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.appointments ap
    WHERE ap.id = appointment_id AND public.can_access_row(ap.owner_id, ap.unit_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.appointments ap
    WHERE ap.id = appointment_id AND public.can_access_row(ap.owner_id, ap.unit_id)
  ));

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='appointment_notification_replies' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.appointment_notification_replies;', pol.policyname);
  END LOOP;
END $$;
-- appointment_id é nullable aqui — sem ele, cai pro próprio owner_id da linha.
CREATE POLICY appointment_notification_replies_scoped ON public.appointment_notification_replies FOR ALL TO authenticated
  USING (
    (appointment_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.appointments ap
      WHERE ap.id = appointment_id AND public.can_access_row(ap.owner_id, ap.unit_id)
    ))
    OR (appointment_id IS NULL AND public.can_access_row(owner_id))
  )
  WITH CHECK (
    (appointment_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.appointments ap
      WHERE ap.id = appointment_id AND public.can_access_row(ap.owner_id, ap.unit_id)
    ))
    OR (appointment_id IS NULL AND public.can_access_row(owner_id))
  );

-- ── 6. clinic_units e clinic_members: políticas próprias ─────────────────

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='clinic_units' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clinic_units;', pol.policyname);
  END LOOP;
END $$;
-- Leitura: qualquer membro ativo da clínica (não só admin) — saber o nome da
-- própria unidade, ou a lista pra um seletor, não é dado sensível.
CREATE POLICY clinic_units_read ON public.clinic_units FOR SELECT TO authenticated
  USING (public.can_access_row(owner_id));
CREATE POLICY clinic_units_admin_insert ON public.clinic_units FOR INSERT TO authenticated
  WITH CHECK (public.can_access_row(owner_id) AND public.is_clinic_admin());
CREATE POLICY clinic_units_admin_update ON public.clinic_units FOR UPDATE TO authenticated
  USING (public.can_access_row(owner_id) AND public.is_clinic_admin())
  WITH CHECK (public.can_access_row(owner_id) AND public.is_clinic_admin());
CREATE POLICY clinic_units_admin_delete ON public.clinic_units FOR DELETE TO authenticated
  USING (public.can_access_row(owner_id) AND public.is_clinic_admin());

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='clinic_members' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clinic_members;', pol.policyname);
  END LOOP;
END $$;
-- Admin administra todo mundo da própria clínica (aprovar, editar, desativar).
CREATE POLICY clinic_members_admin_all ON public.clinic_members FOR ALL TO authenticated
  USING (owner_id = public.current_owner_id() AND public.is_clinic_admin())
  WITH CHECK (owner_id = public.current_owner_id() AND public.is_clinic_admin());
-- Qualquer um lê a própria linha — é como o app sabe seu papel/unidade/status.
CREATE POLICY clinic_members_self_read ON public.clinic_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- Autocadastro: só cria a própria linha, sempre pendente, sem papel/unidade
-- (quem define isso na aprovação é o admin, nunca a própria pessoa), e
-- sempre presa à clínica canônica (a única que existe hoje).
CREATE POLICY clinic_members_self_signup ON public.clinic_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND role IS NULL
    AND unit_id IS NULL
    AND owner_id = public.primary_clinic_owner()
  );
