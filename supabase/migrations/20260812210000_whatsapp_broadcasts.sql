-- Disparo próprio, para uma lista escolhida a dedo.
--
-- Existe porque o motor de campanhas do CRM só sabe mandar para TODOS: o
-- manual de integração v2 (seção 14) confirma que `contactIds` é ignorado, e
-- toda campanha vai `sendToAll: true`. Não há como recortar "só o DDD 48" por
-- lá. Este disparo manda mensagem individual pela conversa de cada contato —
-- o mesmo endpoint que o chat usa todo dia.
--
-- O ritmo é decidido na criação, não no envio: cada alvo nasce com o horário
-- em que deve sair (`scheduled_for = início + i × intervalo`). Assim a fila é
-- previsível, dá para dizer a que horas termina, e o cron não guarda estado
-- nenhum — só manda o que já venceu.

CREATE TABLE IF NOT EXISTS public.whatsapp_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  -- Segundos entre uma mensagem e a seguinte. Rajada derruba número.
  interval_seconds integer NOT NULL DEFAULT 8,
  status text NOT NULL DEFAULT 'running', -- running | done | cancelled
  total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Um alvo por contato. `conversation_id` nulo é quem nunca conversou com a
-- clínica: para esses o envio tenta o caminho por contato, que é especulativo.
--
-- `sent_via` e `error` guardam o que de fato aconteceu com cada um. É por eles
-- que a dúvida sobre o caminho por contato vira resposta depois do primeiro
-- lote real, em vez de continuar sendo suposição.
CREATE TABLE IF NOT EXISTS public.whatsapp_broadcast_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.whatsapp_broadcasts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id text NOT NULL,
  conversation_id text,
  contact_name text,
  phone text,
  status text NOT NULL DEFAULT 'pending', -- pending | sent | failed | skipped
  sent_via text,                          -- conversation | contact
  error text,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz
);

-- A pergunta do cron: o que já venceu e ainda está pendente.
CREATE INDEX IF NOT EXISTS idx_broadcast_targets_due
  ON public.whatsapp_broadcast_targets (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_broadcast_targets_lote
  ON public.whatsapp_broadcast_targets (broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_owner
  ON public.whatsapp_broadcasts (owner_id, created_at DESC);

ALTER TABLE public.whatsapp_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_broadcast_targets ENABLE ROW LEVEL SECURITY;

-- Leitura pelo dono; quem escreve é a Edge Function com service role, como no
-- resto do módulo de CRM.
DROP POLICY IF EXISTS whatsapp_broadcasts_owner_read ON public.whatsapp_broadcasts;
CREATE POLICY whatsapp_broadcasts_owner_read ON public.whatsapp_broadcasts
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS whatsapp_broadcast_targets_owner_read ON public.whatsapp_broadcast_targets;
CREATE POLICY whatsapp_broadcast_targets_owner_read ON public.whatsapp_broadcast_targets
  FOR SELECT USING (owner_id = auth.uid());

GRANT SELECT ON public.whatsapp_broadcasts TO authenticated;
GRANT SELECT ON public.whatsapp_broadcast_targets TO authenticated;
