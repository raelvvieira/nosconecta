-- 1. owner_id nas tabelas financeiras
ALTER TABLE public.financial_accounts     ADD COLUMN IF NOT EXISTS owner_id uuid DEFAULT auth.uid();
ALTER TABLE public.financial_categories   ADD COLUMN IF NOT EXISTS owner_id uuid DEFAULT auth.uid();
ALTER TABLE public.financial_goals        ADD COLUMN IF NOT EXISTS owner_id uuid DEFAULT auth.uid();
ALTER TABLE public.financial_scenarios    ADD COLUMN IF NOT EXISTS owner_id uuid DEFAULT auth.uid();
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS owner_id uuid DEFAULT auth.uid();

DO $$
DECLARE v_admin uuid;
BEGIN
  SELECT id INTO v_admin FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_admin IS NOT NULL THEN
    UPDATE public.financial_accounts     SET owner_id = v_admin WHERE owner_id IS NULL;
    UPDATE public.financial_categories   SET owner_id = v_admin WHERE owner_id IS NULL;
    UPDATE public.financial_goals        SET owner_id = v_admin WHERE owner_id IS NULL;
    UPDATE public.financial_scenarios    SET owner_id = v_admin WHERE owner_id IS NULL;
    UPDATE public.financial_transactions SET owner_id = v_admin WHERE owner_id IS NULL;
  END IF;
END $$;

-- 2. Políticas por dono nas tabelas financeiras
DROP POLICY IF EXISTS financial_accounts_authenticated_all ON public.financial_accounts;
CREATE POLICY financial_accounts_owner ON public.financial_accounts FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS financial_categories_authenticated_all ON public.financial_categories;
CREATE POLICY financial_categories_owner ON public.financial_categories FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS financial_goals_authenticated_all ON public.financial_goals;
CREATE POLICY financial_goals_owner ON public.financial_goals FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS financial_scenarios_authenticated_all ON public.financial_scenarios;
CREATE POLICY financial_scenarios_owner ON public.financial_scenarios FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS financial_transactions_authenticated_all ON public.financial_transactions;
CREATE POLICY financial_transactions_owner ON public.financial_transactions FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- 3. ledger_entries via dono da conta
DROP POLICY IF EXISTS ledger_entries_authenticated_all ON public.ledger_entries;
CREATE POLICY ledger_entries_owner ON public.ledger_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.financial_accounts a WHERE a.id = account_id AND a.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.financial_accounts a WHERE a.id = account_id AND a.owner_id = auth.uid()));

-- 4. Remove políticas permissivas
DROP POLICY IF EXISTS patients_authenticated_all ON public.patients;
DROP POLICY IF EXISTS professionals_authenticated_all ON public.professionals;

-- 5. Profiles: só o próprio
DROP POLICY IF EXISTS "profiles read all authenticated" ON public.profiles;
CREATE POLICY "profiles read self" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- 6. Convites: sem leitura pública
DROP POLICY IF EXISTS "invitations read by token" ON public.invitations;
REVOKE SELECT ON public.invitations FROM anon;

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token uuid)
RETURNS TABLE(id uuid, email text, role app_role, expires_at timestamptz, accepted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.email, i.role, i.expires_at, i.accepted_at
  FROM public.invitations i
  WHERE i.token = _token
$$;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_invitation(_token uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE public.invitations
     SET accepted_at = now()
   WHERE token = _token AND accepted_at IS NULL AND expires_at > now()
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END $$;
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated;

-- 7. Storage: leitura restrita ao dono da pasta
DROP POLICY IF EXISTS crm_campaign_media_public_read ON storage.objects;
CREATE POLICY crm_campaign_media_owner_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'crm-campaign-media' AND (storage.foldername(name))[1] = auth.uid()::text);