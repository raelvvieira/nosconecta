-- Remove o grant implícito de PUBLIC para funções que só devem ser
-- executadas por usuários autenticados. O grant direto para authenticated
-- (feito nas migrações anteriores) permanece.

REVOKE EXECUTE ON FUNCTION public.can_access_row(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_row(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_owner_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_unit_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_clinic_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finance_cash_flow_series(uuid, uuid, date, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finance_revenue_by_category(uuid, uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finance_revenue_by_professional(uuid, uuid, date, date) FROM PUBLIC;