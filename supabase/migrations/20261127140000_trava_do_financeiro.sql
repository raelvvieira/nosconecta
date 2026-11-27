-- Trava do financeiro no banco.
--
-- Até aqui qualquer membro da clínica (dentista, recepção) lia e gravava o
-- financeiro inteiro direto pelo navegador, porque a RLS só olhava "é da
-- mesma clínica". Agora quem não tem a área "financeiro" (nível, ou acesso
-- extra dado pelo administrador) é barrado no banco. A política RESTRICTIVE
-- soma-se às que já existem: tirar esta migration devolve o estado anterior.
--
-- Os fluxos que cruzam áreas (confirmar atendimento gerando recebimento,
-- sinal, recibo, ficha do paciente) passaram a ler/gravar pelo servidor.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'financial_transactions','financial_accounts','financial_categories',
    'financial_goals','financial_scenarios','atendimento_sinais',
    'recibos_enviados','financeiro_do_grupo','financeiro_grupos'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS trava_area_financeiro ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY trava_area_financeiro ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.pode_ver_area(''financeiro'')) WITH CHECK (public.pode_ver_area(''financeiro''))',
        t);
    END IF;
  END LOOP;
END $$;

-- Os relatórios do financeiro recebem o dono por parâmetro e rodam com
-- privilégio total: com EXECUTE aberto, qualquer login (até sem login, no
-- caso do fluxo de caixa) podia pedir os números de QUALQUER clínica.
-- Agora só o servidor chama, depois de checar a área.
REVOKE EXECUTE ON FUNCTION public.finance_cash_flow_series(uuid, uuid, date, date, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_revenue_by_category(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_revenue_by_professional(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_cash_flow_series(uuid, uuid, date, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_revenue_by_category(uuid, uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_revenue_by_professional(uuid, uuid, date, date) TO service_role;
