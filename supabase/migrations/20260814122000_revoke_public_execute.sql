-- Postgres concede EXECUTE a PUBLIC por padrão em toda função nova, mesmo
-- SECURITY DEFINER — as migrations anteriores concediam explicitamente a
-- `authenticated`, mas nunca revogavam o grant implícito de PUBLIC (que
-- inclui `anon`). Corrige isso nas funções auxiliares de RLS e nas RPCs
-- financeiras, mantendo só `primary_clinic_owner()` acessível a `anon`
-- (é a única usada antes de existir sessão de admin nenhuma: o INSERT
-- pendente do autocadastro).

REVOKE EXECUTE ON FUNCTION public.current_owner_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_unit_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_clinic_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_row(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_row(uuid, uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.finance_cash_flow_series(uuid, uuid, date, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finance_revenue_by_category(uuid, uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finance_revenue_by_professional(uuid, uuid, date, date) FROM PUBLIC;
