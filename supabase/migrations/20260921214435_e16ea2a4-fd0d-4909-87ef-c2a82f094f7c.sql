-- Modelos de mensagem e o limite diário de envio saem do CRM.
--
-- ── Os modelos ───────────────────────────────────────────────────────────
--
-- Viviam em `/api/v1/message_templates`, na conta do CRM. Não há nada a
-- trazer: a conta nunca teve um único modelo cadastrado — está escrito no
-- comentário da própria Edge Function, conferido no banco deles. A tabela
-- nasce vazia porque ela já estava vazia lá.
--
-- ── O limite diário ──────────────────────────────────────────────────────
--
-- O contador de quantas mensagens saíram hoje sempre foi nosso
-- (`crm_campaign_sends`), mas o LIMITE morava numa coluna de
-- `crm_credentials` — a tabela das credenciais do CRM, que a Fase 7 apaga.
-- Ele não tem nada a ver com credencial nenhuma: é uma decisão da clínica
-- sobre o próprio número de WhatsApp.
--
-- ── IF NOT EXISTS em tudo ────────────────────────────────────────────────
--
-- Mesmo motivo da migration do funil: o agente do Lovable aplica os arquivos
-- pendentes recombinados numa versão própria, e os originais continuam
-- constando como pendentes. Um segundo "aplicar migrations" precisa ser
-- inofensivo.

CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL DEFAULT '',
  -- Existe porque a tela de disparo já manda imagem junto do texto. Hoje nada
  -- grava aqui: o "salvar como modelo" do disparo guarda só nome e texto.
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dois modelos com o mesmo nome na lista do chat são indistinguíveis para
-- quem escolhe — e escolher o errado manda a mensagem errada ao paciente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_templates_owner_nome
  ON public.message_templates (owner_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.whatsapp_send_settings (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Quantas pessoas podem ser alcançadas por dia, somando disparo e
  -- automações. O WhatsApp é um só, e dois contadores separados deixariam o
  -- número exposto ao dobro do que a clínica escolheu.
  daily_send_limit integer NOT NULL DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- O limite que a clínica já tinha escolhido vem junto. Sem isto, quem havia
-- subido para 500 voltaria a 200 sem aviso, e a fila do dia pararia no meio.
INSERT INTO public.whatsapp_send_settings (owner_id, daily_send_limit)
SELECT owner_id, COALESCE(daily_send_limit, 200)
FROM public.crm_credentials
WHERE owner_id IS NOT NULL
ON CONFLICT (owner_id) DO NOTHING;

-- GRANT além da policy: no Supabase a RLS filtra linhas, mas sem privilégio de
-- tabela o papel `authenticated` nem chega a executar o comando.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_send_settings TO authenticated;
GRANT ALL ON public.whatsapp_send_settings TO service_role;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_send_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_templates_scoped ON public.message_templates;
CREATE POLICY message_templates_scoped ON public.message_templates
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

DROP POLICY IF EXISTS whatsapp_send_settings_scoped ON public.whatsapp_send_settings;
CREATE POLICY whatsapp_send_settings_scoped ON public.whatsapp_send_settings
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

DROP TRIGGER IF EXISTS update_message_templates_updated_at ON public.message_templates;
CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_send_settings_updated_at ON public.whatsapp_send_settings;
CREATE TRIGGER update_whatsapp_send_settings_updated_at BEFORE UPDATE ON public.whatsapp_send_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();