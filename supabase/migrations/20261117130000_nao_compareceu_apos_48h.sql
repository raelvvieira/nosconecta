-- Funil de Leads: "Não Compareceu" só depois de 48 h, e "Agendado" também pelo nome.
--
-- Antes: qualquer agendamento com data anterior a hoje e que ninguém tivesse
-- concluído nem cancelado já era "faltou" — na virada do dia, mesmo que a
-- recepção ainda fosse confirmar o atendimento naquela tarde.
--
-- Agora:
--   • faltou_em só considera um agendamento que não foi concluído nem cancelado
--     E (já foi marcado como "faltou" na agenda, OU o horário de término passou
--     há mais de 48 horas — no fuso da clínica). É a regra automática; marcar
--     "faltou" na agenda continua valendo na hora, que é a opção manual.
--   • proximo_agendamento também enxerga um horário futuro de OUTRO cadastro com o
--     mesmo nome do contato (quem foi marcado sem telefone ou com telefone
--     diferente). Quem tem horário futuro fica em "Agendado" — a tela já dá
--     prioridade a ele sobre "Não Compareceu".
--
-- Mesmas colunas, na mesma ordem: `CREATE OR REPLACE VIEW` só aceita isso.
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
      WHERE a.status NOT IN ('cancelled', 'completed')
        AND (
          a.status = 'missed'
          OR ((a.date + a.end_time) AT TIME ZONE 'America/Sao_Paulo') + interval '48 hours' < now()
        )
        AND a.date < CURRENT_DATE
    ) AS faltou_em
  FROM public.patients p
  JOIN public.appointments a ON a.patient_id = p.id
  WHERE public.fone_canonico(p.phone) IS NOT NULL
  GROUP BY p.owner_id, public.fone_canonico(p.phone)
),
-- O mesmo nome, cadastro diferente: só o que é futuro e não foi cancelado.
agenda_por_nome AS (
  SELECT
    a.owner_id,
    lower(btrim(a.patient_name)) AS nome,
    min(a.date) AS proximo_agendamento
  FROM public.appointments a
  WHERE a.date >= CURRENT_DATE
    AND a.status NOT IN ('cancelled', 'completed')
    AND btrim(COALESCE(a.patient_name, '')) <> ''
  GROUP BY a.owner_id, lower(btrim(a.patient_name))
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
  (COALESCE(ag.agendamentos, 0) > 0 OR nm.proximo_agendamento IS NOT NULL) AS tem_agendamento,
  COALESCE(ag.concluidos, 0) > 0 AS teve_consulta,
  ag.ultima_concluida,
  EXISTS (SELECT 1 FROM desqualificados d
          WHERE d.owner_id = c.owner_id AND d.crm_contact_id = c.crm_contact_id) AS desqualificado,
  LEAST(ag.proximo_agendamento, nm.proximo_agendamento) AS proximo_agendamento,
  ag.faltou_em
FROM contatos c
JOIN conversaram conv ON conv.owner_id = c.owner_id AND conv.fone = c.fone
LEFT JOIN agenda ag ON ag.owner_id = c.owner_id AND ag.fone = c.fone
LEFT JOIN agenda_por_nome nm ON nm.owner_id = c.owner_id AND nm.nome = lower(btrim(c.name));
