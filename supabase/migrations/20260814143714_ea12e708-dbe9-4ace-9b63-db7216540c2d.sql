-- Fundação de múltiplos usuários com papéis e unidades.
--
-- Hoje owner_id É auth.uid() em toda tabela operacional — um login novo é uma
-- conta vazia e isolada, sem nenhum vínculo com os dados da clínica. Este
-- arquivo só ACRESCENTA schema e funções, sem tocar em nenhuma política de
-- RLS existente — a troca de política (o ponto de não-retorno) vive no
-- próximo arquivo, depois do backfill.
--
-- `clinic_members` já existia como roster visual (ver
-- 20260629222736_a7f2c032-...sql) — aqui ele vira a fonte real de acesso:
-- ganha `user_id` (login real), `unit_id`, `status` e os campos de aprovação.

-- ── 1. Unidades ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clinic_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  active boolean NOT NULL DEFAULT true,
  -- Marca a unidade criada no backfill, sugerida por padrão em formulário
  -- novo enquanto o admin não escolher outra.
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_units TO authenticated;
GRANT ALL ON public.clinic_units TO service_role;
ALTER TABLE public.clinic_units ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_clinic_units_updated_at ON public.clinic_units;
CREATE TRIGGER set_clinic_units_updated_at BEFORE UPDATE ON public.clinic_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. clinic_members: de roster visual a associação real ──────────────

ALTER TABLE public.clinic_members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.clinic_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_reason text;

-- Role nasce vazio no autocadastro; só a aprovação do admin preenche.
ALTER TABLE public.clinic_members ALTER COLUMN role DROP NOT NULL;
ALTER TABLE public.clinic_members ALTER COLUMN role DROP DEFAULT;

DO $$ BEGIN
  ALTER TABLE public.clinic_members ADD CONSTRAINT clinic_members_user_id_key UNIQUE (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.clinic_members ADD CONSTRAINT clinic_members_role_check
    CHECK (role IS NULL OR role IN ('admin','reception','dentist','finance'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.clinic_members ADD CONSTRAINT clinic_members_status_check
    CHECK (status IN ('pending','active','rejected','disabled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. unit_id nas tabelas onde local físico importa ────────────────────
--
-- Nullable por enquanto — o próximo arquivo faz o backfill e só então torna
-- obrigatório. Ficam DE FORA (clínica inteira, um WhatsApp/CRM só pra
-- clínica toda): clinic_procedures, financial_categories/goals/scenarios,
-- crm_*, meta_capi_*, push_*, pipeline_*.

ALTER TABLE public.patients                ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.clinic_units(id);
ALTER TABLE public.professionals           ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.clinic_units(id);
ALTER TABLE public.clinic_chairs           ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.clinic_units(id);
ALTER TABLE public.appointments            ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.clinic_units(id);
ALTER TABLE public.blocked_times           ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.clinic_units(id);
ALTER TABLE public.waiting_list            ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.clinic_units(id);
ALTER TABLE public.financial_accounts      ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.clinic_units(id);
ALTER TABLE public.financial_transactions  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.clinic_units(id);

-- appointment_notifications / appointment_notification_replies / ledger_entries
-- NÃO ganham unit_id próprio — continuam no padrão já usado por ledger_entries
-- hoje (RLS via EXISTS contra a tabela-pai), só que a tabela-pai agora também
-- carrega unidade. Ver reescrita de política no próximo arquivo.

-- ── 3b. company_id, legado, deixa de ser exigido ────────────────────────
--
-- `financial_accounts/transactions/categories/goals/scenarios.company_id` são
-- `text NOT NULL` desde a criação das tabelas, sem default — hoje sempre
-- gravado como o valor fixo `"demo"` pelo código (nunca foi um filtro real de
-- dono; a separação de verdade sempre foi a RLS por `owner_id`). Este módulo
-- para de escrever nessa coluna a partir de agora — sem torná-la opcional
-- aqui, todo INSERT novo quebraria por violar o NOT NULL. Mesmo tratamento
-- que `patients`/`professionals.company_id` já receberam antes (migration
-- 20260629222736, "Make company_id nullable for legacy columns we no longer
-- use as filter").
ALTER TABLE public.financial_accounts     ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.financial_transactions ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.financial_categories   ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.financial_goals        ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.financial_scenarios    ALTER COLUMN company_id DROP NOT NULL;

-- ── 4. Funções de resolução de acesso ────────────────────────────────────
--
-- current_owner_id()/current_unit_id()/is_clinic_admin() são o caminho
-- quente de TODA leitura/escrita — comparam contra a própria linha de
-- clinic_members do usuário, que é estável. primary_clinic_owner() só é
-- usada 1x no backfill (arquivo seguinte) e na política de INSERT do
-- autocadastro: um erro nela não pode travar o sistema inteiro, então ela
-- fica fora do caminho quente de propósito.

CREATE OR REPLACE FUNCTION public.primary_clinic_owner()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM auth.users ORDER BY created_at LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.primary_clinic_owner() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.current_owner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT owner_id FROM public.clinic_members WHERE user_id = auth.uid() AND status = 'active' LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.current_owner_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_unit_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT unit_id FROM public.clinic_members WHERE user_id = auth.uid() AND status = 'active' LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.current_unit_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_clinic_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_members m
    WHERE m.user_id = auth.uid() AND m.status = 'active' AND m.role = 'admin'
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_clinic_admin() TO authenticated;

-- Overload 1: tabelas clínica-inteira (sem unit_id).
CREATE OR REPLACE FUNCTION public.can_access_row(_owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _owner_id = public.current_owner_id()
$$;
GRANT EXECUTE ON FUNCTION public.can_access_row(uuid) TO authenticated;

-- Overload 2: tabelas com unit_id. NULL na coluna só é visível pra admin
-- (fail-closed) — mas hoje toda linha unit-scoped é NOT NULL depois do
-- próximo arquivo, então esse ramo só importa durante a janela do backfill.
CREATE OR REPLACE FUNCTION public.can_access_row(_owner_id uuid, _unit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _owner_id = public.current_owner_id()
    AND (public.is_clinic_admin() OR _unit_id = public.current_unit_id())
$$;
GRANT EXECUTE ON FUNCTION public.can_access_row(uuid, uuid) TO authenticated;

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

-- As três RPCs do resumo financeiro (`finance_cash_flow_series`,
-- `finance_revenue_by_category`, `finance_revenue_by_professional`) filtravam
-- por `company_id` — a coluna legada, que hoje só existe com o valor fixo
-- "demo". Elas são `SECURITY DEFINER` (ignoram RLS por definição) e estavam
-- concedidas até para `anon`: qualquer chamada, autenticada ou não, sabendo
-- (ou chutando) `company_id = "demo"` lia os agregados financeiros inteiros
-- da clínica. Isso já era um problema antes desta feature; a fundação de
-- múltiplos usuários só tornou impossível ignorar, porque `company_id` nunca
-- vai distinguir clínica nem unidade.
--
-- Trocam `p_company_id text` por `p_owner_id uuid` (obrigatório) e
-- `p_unit_id uuid` (opcional — nulo lê todas as unidades do dono, do mesmo
-- jeito que o resto do módulo financeiro). Concessão passa a ser só para
-- `authenticated`; quem chama continua sendo `queries.functions.ts`, que
-- passa `context.ownerId`/o filtro de unidade resolvido no servidor — nunca
-- um valor vindo direto do cliente sem checagem.

DROP FUNCTION IF EXISTS public.finance_cash_flow_series(text, date, date, text);
DROP FUNCTION IF EXISTS public.finance_revenue_by_category(text, date, date);
DROP FUNCTION IF EXISTS public.finance_revenue_by_professional(text, date, date);

CREATE OR REPLACE FUNCTION public.finance_cash_flow_series(
  p_owner_id uuid,
  p_unit_id uuid,
  p_from date,
  p_to date,
  p_granularity text
) RETURNS TABLE (bucket date, income numeric, expense numeric, future_receivable numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_unit text := CASE p_granularity WHEN 'weekly' THEN 'week' WHEN 'monthly' THEN 'month' ELSE 'day' END;
BEGIN
  RETURN QUERY
  SELECT
    CAST(date_trunc(v_unit, d.day) AS date) AS bucket,
    COALESCE(SUM(CASE WHEN t.type='receivable' AND t.status='paid'    AND t.paid_date = d.day THEN t.amount END),0) AS income,
    COALESCE(SUM(CASE WHEN t.type='payable'    AND t.status='paid'    AND t.paid_date = d.day THEN t.amount END),0) AS expense,
    COALESCE(SUM(CASE WHEN t.type='receivable' AND t.status='pending' AND t.due_date  = d.day THEN t.amount END),0) AS future_receivable
  FROM generate_series(p_from, p_to, interval '1 day') AS d(day)
  LEFT JOIN public.financial_transactions t
    ON t.owner_id = p_owner_id
   AND (p_unit_id IS NULL OR t.unit_id = p_unit_id)
   AND ((t.status='paid' AND t.paid_date = d.day) OR (t.status='pending' AND t.due_date = d.day))
  GROUP BY 1
  ORDER BY 1;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.finance_cash_flow_series(uuid,uuid,date,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_revenue_by_category(
  p_owner_id uuid, p_unit_id uuid, p_from date, p_to date
) RETURNS TABLE (category_id uuid, name text, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  -- Categoria é clínica inteira (sem unit_id); a transação ligada a ela,
  -- essa sim, é filtrada por unidade quando pedido.
  SELECT c.id, c.name, COALESCE(SUM(t.amount),0) AS total
  FROM public.financial_categories c
  LEFT JOIN public.financial_transactions t
    ON t.category_id = c.id
   AND t.owner_id = p_owner_id
   AND (p_unit_id IS NULL OR t.unit_id = p_unit_id)
   AND t.type='receivable' AND t.status='paid'
   AND t.paid_date BETWEEN p_from AND p_to
  WHERE c.owner_id = p_owner_id AND c.type='income'
  GROUP BY c.id, c.name
  ORDER BY total DESC;
$fn$;
GRANT EXECUTE ON FUNCTION public.finance_revenue_by_category(uuid,uuid,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_revenue_by_professional(
  p_owner_id uuid, p_unit_id uuid, p_from date, p_to date
) RETURNS TABLE (professional_id uuid, name text, total numeric, commission_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT p.id, p.name, COALESCE(SUM(t.amount),0), p.commission_pct
  FROM public.professionals p
  LEFT JOIN public.financial_transactions t
    ON t.professional_id = p.id
   AND t.owner_id = p_owner_id
   AND (p_unit_id IS NULL OR t.unit_id = p_unit_id)
   AND t.type='receivable' AND t.status='paid'
   AND t.paid_date BETWEEN p_from AND p_to
  WHERE p.owner_id = p_owner_id AND (p_unit_id IS NULL OR p.unit_id = p_unit_id)
  GROUP BY p.id, p.name, p.commission_pct
  ORDER BY 3 DESC;
$fn$;
GRANT EXECUTE ON FUNCTION public.finance_revenue_by_professional(uuid,uuid,date,date) TO authenticated;