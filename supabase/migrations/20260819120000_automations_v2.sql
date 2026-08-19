-- Automações v2: janela de horário/dias, fila de execução adiada
-- ("aguardar tempo" e adiamento fora da janela) e tipo de push próprio.

-- 1. Janela de horário e dias, por automação.
--
-- Coluna separada de trigger_conditions de propósito: aquela é igualdade
-- estrita sobre 3 chaves (stageId/status/dealStatus), avaliada por
-- matchesConditions, e não comporta faixa de horário.
--
-- Formato:
--   { "enabled": true, "days": [1,2,3,4,5], "start": "08:00",
--     "end": "18:00", "outside": "defer" }   -- defer | skip
-- days segue getDay() do JS: 0=domingo ... 6=sábado.
-- Avaliado sempre em America/Sao_Paulo (a Edge Function roda em UTC).
ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS schedule_window jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Fila de execução adiada.
--
-- Mesmo papel de whatsapp_broadcast_targets: linha com horário + cron de um
-- minuto que colhe o que venceu. Nasce de duas situações — a ação "aguardar
-- tempo" (guarda o resto da lista para depois) e a janela de horário com
-- outside=defer (guarda a lista inteira para a próxima abertura).
--
-- rule_id em CASCADE (e não SET NULL como em automation_runs): excluir a
-- automação tem que matar o trabalho pendente dela. O log sobrevive; a fila
-- não pode sobreviver, senão roda órfã depois de a clínica ter apagado a
-- regra de propósito.
--
-- depth é persistido porque o guardrail antiloop (depth >= 2) hoje viaja por
-- chamada HTTP; sem gravar aqui, ele evaporaria na retomada.
CREATE TABLE IF NOT EXISTS public.automation_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  rule_name text,
  trigger_event text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  remaining_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  depth integer NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | done | failed | cancelled
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ran_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_automation_pending_due
  ON public.automation_pending_actions (status, run_after);

ALTER TABLE public.automation_pending_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_pending_owner_read ON public.automation_pending_actions;
-- Só leitura pelo dono: quem escreve é a Edge Function com service role.
CREATE POLICY automation_pending_owner_read ON public.automation_pending_actions
  FOR SELECT USING (owner_id = auth.uid());

-- 3. Push de automação ganha preferência própria.
--
-- Reaproveitar um dos quatro tipos existentes faria a preferência de
-- "resultado de negociação" controlar silenciosamente push de automação.
ALTER TABLE public.push_preferences
  ADD COLUMN IF NOT EXISTS automation boolean NOT NULL DEFAULT true;
