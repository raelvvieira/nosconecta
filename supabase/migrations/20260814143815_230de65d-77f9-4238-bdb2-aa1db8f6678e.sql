-- Revoga acesso anon das funções SECURITY DEFINER que não devem ser
-- chamadas sem autenticação. O default do Supabase concede EXECUTE para
-- anon em funções públicas; sem REVOKE explícito, GRANT TO authenticated
-- não é suficiente.

REVOKE EXECUTE ON FUNCTION public.can_access_row(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_row(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_owner_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_unit_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_clinic_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.finance_cash_flow_series(uuid, uuid, date, date, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finance_revenue_by_category(uuid, uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finance_revenue_by_professional(uuid, uuid, date, date) FROM anon;