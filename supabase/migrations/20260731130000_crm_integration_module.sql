-- Substitui a integração direta com Evolution API ("Atendimentos" v1) por
-- integração com o CRM white-label (Wavy), que passa a intermediar WhatsApp,
-- pipeline, contatos e campanhas. Ver conversa/plano — a conexão direta
-- nunca chegou a ir pra produção com uso real.

DROP TABLE IF EXISTS public.whatsapp_messages CASCADE;
DROP TABLE IF EXISTS public.whatsapp_conversations CASCADE;
DROP TABLE IF EXISTS public.whatsapp_instances CASCADE;

-- Uma linha por clínica (owner_id) com as credenciais/estado da conexão com
-- o CRM. Acesso só via service role (Edge Functions) — de propósito SEM
-- nenhuma policy de RLS pra authenticated/anon, pra que a senha e o token
-- nunca sejam alcançáveis por uma query feita com o JWT do usuário.
CREATE TABLE public.crm_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_email text NOT NULL,
  crm_password text NOT NULL,
  access_token text,
  token_expires_at timestamptz,
  inbox_id text,
  evolution_instance_name text,
  pipeline_id text,
  whatsapp_status text NOT NULL DEFAULT 'disconnected', -- disconnected | connecting | open | error
  phone_number text,
  qr_code text,
  qr_expires_at timestamptz,
  last_error text,
  daily_send_limit integer NOT NULL DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_credentials ENABLE ROW LEVEL SECURITY;
-- Sem CREATE POLICY: RLS habilitado + zero policies = deny-all para
-- authenticated/anon. Só o service role (que ignora RLS) lê/escreve aqui.

-- Log de execuções de campanha, só o necessário pra aplicar o limite diário
-- de disparo (proteção própria deste app, o CRM não tem esse conceito).
CREATE TABLE public.crm_campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  recipient_count integer NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_campaign_sends_owner_day
  ON public.crm_campaign_sends (owner_id, executed_at);

ALTER TABLE public.crm_campaign_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_campaign_sends_owner ON public.crm_campaign_sends;
CREATE POLICY crm_campaign_sends_owner ON public.crm_campaign_sends
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Vínculo paciente → contato no CRM (não duplica dado do paciente, só
-- guarda o id remoto pra permitir PATCH em vez de recriar).
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS crm_contact_id text;
