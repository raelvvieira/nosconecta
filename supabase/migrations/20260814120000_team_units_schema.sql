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
