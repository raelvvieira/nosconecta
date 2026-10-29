-- Isolamento por consultório: as últimas regras que olhavam para a PESSOA
-- logada (`auth.uid()`) em vez do CONSULTÓRIO dela (`can_access_row`).
--
-- ── Por quê ──────────────────────────────────────────────────────────────
--
-- `owner_id = auth.uid()` só é verdade para quem é o dono da conta. Com um
-- consultório só, isso escondia estas tabelas da equipe (quem não é o dono via
-- tudo vazio), mas não abria nada. Com vários consultórios, a regra certa é a
-- de todo o resto do banco: `can_access_row(owner_id)`, que compara com o
-- consultório de quem está logado (`current_owner_id()`).
--
-- As Edge Functions e as server functions que gravam aqui usam a chave de
-- serviço, que passa por cima destas regras: nada muda para elas.

-- WhatsApp (espelho da Evolution): só leitura para quem está logado.
DROP POLICY IF EXISTS wa_contacts_owner_read ON public.wa_contacts;
CREATE POLICY wa_contacts_clinica_read ON public.wa_contacts
  FOR SELECT TO authenticated USING (public.can_access_row(owner_id));

DROP POLICY IF EXISTS wa_conversations_owner_read ON public.wa_conversations;
CREATE POLICY wa_conversations_clinica_read ON public.wa_conversations
  FOR SELECT TO authenticated USING (public.can_access_row(owner_id));

DROP POLICY IF EXISTS wa_messages_owner_read ON public.wa_messages;
CREATE POLICY wa_messages_clinica_read ON public.wa_messages
  FOR SELECT TO authenticated USING (public.can_access_row(owner_id));

DROP POLICY IF EXISTS wa_instances_owner_read ON public.wa_instances;
CREATE POLICY wa_instances_clinica_read ON public.wa_instances
  FOR SELECT TO authenticated USING (public.can_access_row(owner_id));

-- Automações. Eram `TO public`; passam a `TO authenticated`, como o resto.
DROP POLICY IF EXISTS automation_rules_owner ON public.automation_rules;
CREATE POLICY automation_rules_clinica ON public.automation_rules
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

DROP POLICY IF EXISTS automation_runs_owner_read ON public.automation_runs;
CREATE POLICY automation_runs_clinica_read ON public.automation_runs
  FOR SELECT TO authenticated USING (public.can_access_row(owner_id));

DROP POLICY IF EXISTS automation_pending_owner_read ON public.automation_pending_actions;
CREATE POLICY automation_pending_clinica_read ON public.automation_pending_actions
  FOR SELECT TO authenticated USING (public.can_access_row(owner_id));

-- Avisos e regras do funil.
DROP POLICY IF EXISTS clinic_notifications_owner_read ON public.clinic_notifications;
CREATE POLICY clinic_notifications_clinica_read ON public.clinic_notifications
  FOR SELECT TO authenticated USING (public.can_access_row(owner_id));

DROP POLICY IF EXISTS clinic_notifications_owner_update ON public.clinic_notifications;
CREATE POLICY clinic_notifications_clinica_update ON public.clinic_notifications
  FOR UPDATE TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

DROP POLICY IF EXISTS clinic_funnel_rules_owner ON public.clinic_funnel_rules;
CREATE POLICY clinic_funnel_rules_clinica ON public.clinic_funnel_rules
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

-- Depósito das imagens de campanha e dos casos da Luna. A pasta de cima é o
-- consultório, como em `patient-files`. As 20 imagens que já existem estão
-- todas na pasta do dono da NÓS, que é o consultório dela: nada se perde.
-- Comparação em texto, sem `::uuid`: um nome de pasta que não é uuid só não
-- bate, em vez de derrubar a consulta.
DROP POLICY IF EXISTS crm_campaign_media_owner_read ON storage.objects;
DROP POLICY IF EXISTS crm_campaign_media_owner_insert ON storage.objects;
DROP POLICY IF EXISTS crm_campaign_media_owner_update ON storage.objects;
DROP POLICY IF EXISTS crm_campaign_media_owner_delete ON storage.objects;

CREATE POLICY crm_campaign_media_clinica_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'crm-campaign-media'
    AND (storage.foldername(name))[1] = public.current_owner_id()::text);
CREATE POLICY crm_campaign_media_clinica_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'crm-campaign-media'
    AND (storage.foldername(name))[1] = public.current_owner_id()::text);
CREATE POLICY crm_campaign_media_clinica_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'crm-campaign-media'
    AND (storage.foldername(name))[1] = public.current_owner_id()::text)
  WITH CHECK (bucket_id = 'crm-campaign-media'
    AND (storage.foldername(name))[1] = public.current_owner_id()::text);
CREATE POLICY crm_campaign_media_clinica_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'crm-campaign-media'
    AND (storage.foldername(name))[1] = public.current_owner_id()::text);

-- Cotação do dólar: uma tabela só para todos. Quem está logado lê; quem grava
-- é o servidor, com a chave de serviço (`cotacaoDeHoje`). Antes qualquer
-- pessoa logada podia gravar a cotação que todos os consultórios veem.
DROP POLICY IF EXISTS cotacao_dolar_leitura ON public.cotacao_dolar;
CREATE POLICY cotacao_dolar_leitura ON public.cotacao_dolar
  FOR SELECT TO authenticated USING (true);

-- Cadastro solto: qualquer conta nova podia se pôr na fila da NÓS (o
-- "primeiro usuário do banco"). Desde 20/10 a entrada é só por convite, e
-- nada no sistema usa mais esta regra nem a função.
DROP POLICY IF EXISTS clinic_members_self_signup ON public.clinic_members;
DROP FUNCTION IF EXISTS public.primary_clinic_owner();
