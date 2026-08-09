-- Notificações push (Web Push) para os aparelhos da equipe da clínica.
--
-- Diferente de e-mail/SMS/WhatsApp, que vão para o PACIENTE: push vai para
-- quem trabalha na clínica. Por isso não reusa a tabela de notificação de
-- agendamento — o destinatário é outro.
--
-- As chaves VAPID são do servidor (env var, como BREVO_API_KEY), não da
-- clínica. O que é por clínica são as inscrições dos aparelhos, que são
-- dado e não segredo — daí RLS de dono normal, e não o deny-all de
-- crm_credentials: o próprio front registra e remove o aparelho.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- URL que o navegador dá; é o identificador único do aparelho+navegador.
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner ON public.push_subscriptions (owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_subscriptions_owner ON public.push_subscriptions;
CREATE POLICY push_subscriptions_owner ON public.push_subscriptions
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Quais tipos a clínica quer receber. Colunas explícitas em vez de jsonb:
-- são quatro chaves conhecidas, viram checkbox direto e o banco valida.
CREATE TABLE IF NOT EXISTS public.push_preferences (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_message boolean NOT NULL DEFAULT true,
  daily_agenda boolean NOT NULL DEFAULT true,
  appointment_reply boolean NOT NULL DEFAULT true,
  deal_result boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_preferences TO authenticated;
GRANT ALL ON public.push_preferences TO service_role;
ALTER TABLE public.push_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_preferences_owner ON public.push_preferences;
CREATE POLICY push_preferences_owner ON public.push_preferences
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Estado do polling de conversas do CRM.
--
-- O CRM não tem webhook de entrada, então "chegou mensagem nova" é detectado
-- comparando o contador de não-lidas de cada conversa com o da rodada
-- anterior. Não dá para usar data: o `created_at` que a lista devolve é o da
-- criação da conversa, não o da última mensagem.
CREATE TABLE IF NOT EXISTS public.push_poll_state (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  unread_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Só o service role mexe (é o cron que escreve); o front nunca lê isso.
GRANT ALL ON public.push_poll_state TO service_role;
ALTER TABLE public.push_poll_state ENABLE ROW LEVEL SECURITY;
-- Sem policy de propósito: RLS habilitado + zero policies = deny-all para
-- authenticated/anon.