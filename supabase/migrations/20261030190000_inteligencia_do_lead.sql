-- A Inteligência do Lead: a leitura de cada conversa, a nota e o funil de
-- seis etapas. As regras moram em `supabase/functions/_shared/inteligencia-do-lead.ts`.

-- ── A leitura de cada pessoa ─────────────────────────────────────────────
--
-- Uma linha por pessoa (o telefone canônico, como `lead_funnel_signals`).
-- Quem grava é só a rotina `inteligencia-do-lead`, com a chave de serviço; a
-- equipe só lê.
CREATE TABLE IF NOT EXISTS public.lead_inteligencia (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fone text NOT NULL,
  crm_contact_id text,
  conversation_id text,
  -- novo | interessado | proposta | horario_oferecido. "Agendado" e "Não
  -- compareceu" não moram aqui: quem diz é a agenda.
  etapa text NOT NULL DEFAULT 'novo',
  -- A nota da conversa no momento da leitura (sem a agenda). A tela recalcula
  -- com a agenda; esta é a que vai para o histórico.
  nota integer,
  valor numeric(12, 2),
  procedimento_id uuid,
  leitura jsonb,
  ritmo jsonb,
  -- A última mensagem que a leitura já viu. Mensagem mais nova que isto =
  -- ler de novo.
  lido_ate timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, fone)
);

-- A nota ao longo do tempo. É o que permite, daqui a uns meses, comparar a
-- nota com quem agendou e veio e calibrar os pesos com dados de verdade.
CREATE TABLE IF NOT EXISTS public.lead_inteligencia_historico (
  id bigserial PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fone text NOT NULL,
  etapa text NOT NULL,
  nota integer,
  valor numeric(12, 2),
  em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_historico_owner_fone
  ON public.lead_inteligencia_historico (owner_id, fone, em);

GRANT SELECT ON public.lead_inteligencia TO authenticated;
GRANT ALL ON public.lead_inteligencia TO service_role;
GRANT SELECT ON public.lead_inteligencia_historico TO authenticated;
GRANT ALL ON public.lead_inteligencia_historico TO service_role;
GRANT USAGE ON SEQUENCE public.lead_inteligencia_historico_id_seq TO service_role;

ALTER TABLE public.lead_inteligencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_inteligencia_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_inteligencia_ler ON public.lead_inteligencia;
CREATE POLICY lead_inteligencia_ler ON public.lead_inteligencia
  FOR SELECT TO authenticated
  USING (public.can_access_row(owner_id));

DROP POLICY IF EXISTS lead_inteligencia_historico_ler ON public.lead_inteligencia_historico;
CREATE POLICY lead_inteligencia_historico_ler ON public.lead_inteligencia_historico
  FOR SELECT TO authenticated
  USING (public.can_access_row(owner_id));

-- ── As regras do funil de Leads, editáveis ──────────────────────────────
--
-- A tela já sabia editar Clientes e Perdidos; Leads ficava sempre no padrão
-- porque a coluna nunca foi criada.
ALTER TABLE public.clinic_funnel_rules ADD COLUMN IF NOT EXISTS leads jsonb;

-- ── A agenda separa "Agendado" de "Não compareceu" ──────────────────────
--
-- A mesma view, com duas colunas a mais NO FIM (o `CREATE OR REPLACE VIEW`
-- só aceita acrescentar no fim):
--   proximo_agendamento: o próximo horário de hoje em diante, não cancelado;
--   faltou_em: o último horário que já passou sem ser confirmado como
--   realizado nem cancelado.
CREATE OR REPLACE VIEW public.lead_funnel_signals
WITH (security_invoker = on) AS
WITH contatos AS (
  SELECT
    ct.owner_id,
    public.fone_canonico(COALESCE(ct.phone_e164, ct.phone_raw)) AS fone,
    min(ct.crm_contact_id) AS crm_contact_id,
    max(NULLIF(btrim(COALESCE(ct.name, '')), '')) AS name
  FROM public.wa_contacts ct
  WHERE ct.crm_contact_id NOT LIKE '%@lid'
    AND ct.crm_contact_id NOT LIKE '%@g.us'
    AND public.fone_canonico(COALESCE(ct.phone_e164, ct.phone_raw)) IS NOT NULL
  GROUP BY ct.owner_id, public.fone_canonico(COALESCE(ct.phone_e164, ct.phone_raw))
),
conversaram AS (
  SELECT
    c.owner_id,
    public.fone_canonico(COALESCE(ct.phone_e164, ct.phone_raw)) AS fone,
    max(c.last_message_at) AS ultima_mensagem
  FROM public.wa_conversations c
  JOIN public.wa_contacts ct
    ON ct.crm_contact_id = c.crm_contact_id AND ct.owner_id = c.owner_id
  WHERE c.crm_conversation_id NOT LIKE '%@g.us'
    AND public.fone_canonico(COALESCE(ct.phone_e164, ct.phone_raw)) IS NOT NULL
  GROUP BY c.owner_id, public.fone_canonico(COALESCE(ct.phone_e164, ct.phone_raw))
),
agenda AS (
  SELECT
    p.owner_id,
    public.fone_canonico(p.phone) AS fone,
    count(*) AS agendamentos,
    count(*) FILTER (WHERE a.status = 'completed') AS concluidos,
    max(a.date) FILTER (WHERE a.status = 'completed') AS ultima_concluida,
    min(a.date) FILTER (
      WHERE a.date >= CURRENT_DATE AND a.status NOT IN ('cancelled', 'completed')
    ) AS proximo_agendamento,
    max(a.date) FILTER (
      WHERE a.date < CURRENT_DATE AND a.status NOT IN ('cancelled', 'completed')
    ) AS faltou_em
  FROM public.patients p
  JOIN public.appointments a ON a.patient_id = p.id
  WHERE public.fone_canonico(p.phone) IS NOT NULL
  GROUP BY p.owner_id, public.fone_canonico(p.phone)
),
desqualificados AS (
  SELECT DISTINCT ct.owner_id, ct.crm_contact_id
  FROM public.contact_tags ct
  JOIN public.clinic_tags t ON t.id = ct.tag_id
  WHERE lower(btrim(t.name)) = 'desqualificado'
    AND ct.crm_contact_id IS NOT NULL
)
SELECT
  c.owner_id,
  c.fone,
  c.crm_contact_id,
  COALESCE(c.name, '') AS name,
  conv.ultima_mensagem,
  CASE
    WHEN conv.ultima_mensagem IS NULL THEN NULL::integer
    ELSE (CURRENT_DATE - conv.ultima_mensagem::date)
  END AS dias_em_silencio,
  COALESCE(ag.agendamentos, 0) > 0 AS tem_agendamento,
  COALESCE(ag.concluidos, 0) > 0 AS teve_consulta,
  ag.ultima_concluida,
  EXISTS (SELECT 1 FROM desqualificados d
          WHERE d.owner_id = c.owner_id AND d.crm_contact_id = c.crm_contact_id) AS desqualificado,
  ag.proximo_agendamento,
  ag.faltou_em
FROM contatos c
JOIN conversaram conv ON conv.owner_id = c.owner_id AND conv.fone = c.fone
LEFT JOIN agenda ag ON ag.owner_id = c.owner_id AND ag.fone = c.fone;

-- ── A rotina ────────────────────────────────────────────────────────────
--
-- De 10 em 10 minutos. Mesmo molde das outras em `scripts/migracao/rotinas.sql`.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'inteligencia-do-lead';
SELECT cron.schedule(
  'inteligencia-do-lead',
  '*/10 * * * *',
  $$SELECT public.chamar_rotina('inteligencia-do-lead')$$
);
