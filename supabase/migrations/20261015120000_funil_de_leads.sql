-- O funil de Leads passa a ser calculado, como o de Clientes.
--
-- ── O que isto substitui ─────────────────────────────────────────────────
--
-- `funnel_cards`: cards criados À MÃO, um a um, pela tela de conversas. Em
-- 14/10 a tabela tinha ZERO linhas — o quadro existia, a coluna "Primeiro
-- Contato" mostrava 0, e ninguém nunca usou o botão. Um funil que depende de
-- alguém lembrar de alimentá-lo não é um funil; é uma lista de tarefas que
-- ninguém faz.
--
-- A clínica definiu a regra: **lead é quem chamou no WhatsApp e ainda não tem
-- atendimento confirmado**. Quem agendou e não apareceu continua lead, porque
-- agendar não é vir. O que separa lead de cliente é o botão "Confirmar
-- atendimento realizado", que grava `appointments.status = 'completed'`.
--
-- ── Por que telefone, e não `crm_contact_id` ─────────────────────────────
--
-- Pelo mesmo motivo medido em `getTelefonesNaAgenda`: `crm_contact_id` liga 11
-- das 49 pessoas com horário marcado, e telefone liga 44. A coluna só é
-- preenchida por quem virou paciente a partir de uma conversa; quem a recepção
-- cadastrou direto na agenda não tem nada ali.
--
-- Telefone é a identidade que o resto do sistema já usa — na caixa de entrada,
-- na base de disparo e na dedução de quem é quem.

-- ── A forma canônica de um número ────────────────────────────────────────
--
-- ⚠️ **Gêmea de `variantesDoNumero`** (`src/lib/atendimentos/phone.ts` e
-- `supabase/functions/_shared/phone-match.ts`). Mexeu lá, mexa aqui.
--
-- Lá a função devolve as DUAS formas, para a busca virar um `IN` que usa
-- índice. Aqui, dentro de uma view que compara dois conjuntos, o que serve é o
-- contrário: reduzir os dois lados à MESMA forma e comparar por igualdade.
-- São as duas faces da mesma regra, e a regra é esta: o nono dígito só é
-- tirado quando o que sobra ainda tem desenho de celular (começa em 6 a 9).
-- "5551933334444" sem o 9 daria "555133334444", que é desenho de FIXO — o
-- número de outra pessoa.
CREATE OR REPLACE FUNCTION public.fone_canonico(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH so_digitos AS (
    SELECT regexp_replace(COALESCE(raw, ''), '[^0-9]', '', 'g') AS x
  ),
  com_pais AS (
    -- 10 ou 11 dígitos = falta o país. SEMPRE, inclusive quando começa com 55:
    -- aí o 55 é o DDD (Santa Maria, Uruguaiana), não o Brasil.
    SELECT CASE WHEN length(x) IN (10, 11) THEN '55' || x ELSE x END AS x FROM so_digitos
  )
  SELECT CASE
    WHEN length(x) = 13 AND substring(x, 5, 2) ~ '^9[6-9]$' THEN substring(x, 1, 4) || substring(x, 6)
    -- 13 dígitos que NÃO reduzem continuam valendo como eles mesmos. Sem esta
    -- linha eles virariam NULL e sumiriam do funil — são 74 nesta base, os
    -- celulares cujo nono dígito é seguido de 2 a 5.
    WHEN length(x) IN (12, 13) THEN x
    ELSE NULL
  END
  FROM com_pais
$$;

COMMENT ON FUNCTION public.fone_canonico(text) IS
  'A forma canônica de um telefone brasileiro, para casar ficha com contato. Gêmea de variantesDoNumero em src/lib/atendimentos/phone.ts — mexeu lá, mexa aqui.';

-- ── Os sinais de cada lead ───────────────────────────────────────────────
--
-- Uma linha por PESSOA, não por contato: a mesma pessoa tem linha na origem
-- herdada do CRM e na da conexão própria, e duas linhas no funil seriam duas
-- vezes a mesma pessoa na mesma coluna.
--
-- Molde de `patient_funnel_signals`, que faz o mesmo para o funil de Clientes.
-- `security_invoker=on` como em `patient_funnel_signals`: sem isso a view roda
-- com os poderes de quem a criou e ignora o RLS das tabelas de baixo — uma
-- clínica leria os contatos da outra. O filtro por `owner_id` que o aplicativo
-- faz é conveniência, não segurança.
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
-- Só quem CHAMOU. Contato sem conversa é cadastro, não lead: a clínica disse
-- "todos que chamaram no whatsapp", e importar 3 mil fichas antigas para
-- dentro do funil o encheria de gente que nunca falou com ninguém.
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
-- A agenda, pelo telefone da ficha. `completed` é o que o botão "Confirmar
-- atendimento realizado" grava, e é ele que separa lead de cliente.
agenda AS (
  SELECT
    p.owner_id,
    public.fone_canonico(p.phone) AS fone,
    count(*) AS agendamentos,
    count(*) FILTER (WHERE a.status = 'completed') AS concluidos,
    max(a.date) FILTER (WHERE a.status = 'completed') AS ultima_concluida
  FROM public.patients p
  JOIN public.appointments a ON a.patient_id = p.id
  WHERE public.fone_canonico(p.phone) IS NOT NULL
  GROUP BY p.owner_id, public.fone_canonico(p.phone)
),
-- A tag que a clínica já usa à mão para "não falar mais com esta pessoa".
-- Reaproveitada em vez de criar um segundo marcador: dois lugares para dizer a
-- mesma coisa é como eles passam a discordar.
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
          WHERE d.owner_id = c.owner_id AND d.crm_contact_id = c.crm_contact_id) AS desqualificado
FROM contatos c
JOIN conversaram conv ON conv.owner_id = c.owner_id AND conv.fone = c.fone
LEFT JOIN agenda ag ON ag.owner_id = c.owner_id AND ag.fone = c.fone;

COMMENT ON VIEW public.lead_funnel_signals IS
  'Uma linha por pessoa que já chamou no WhatsApp, com os sinais que classificam o funil de Leads. Lead é quem ainda não tem atendimento confirmado.';

GRANT SELECT ON public.lead_funnel_signals TO authenticated;

-- ── Quantos atendimentos a pessoa já teve ────────────────────────────────
--
-- A view de Clientes ganha `consultas_concluidas`, e com ela a coluna "Novo"
-- muda de sentido.
--
-- Antes, "Novo" era `nunca_teve_consulta`: ficha SEM atendimento. Com a
-- importação antiga, isso punha 3.227 das 3.268 fichas numa coluna chamada
-- "Novo" que ninguém abriria — a maioria é cadastro herdado de gente que nunca
-- falou com a clínica.
--
-- A clínica redefiniu em 14/10: cliente é quem teve atendimento CONFIRMADO, e
-- "Novo" é quem veio uma vez só. Quem ainda não confirmou não é cliente
-- nenhum — é lead, e vive no funil acima.
--
-- A coluna entra NO FIM da lista de propósito: `CREATE OR REPLACE VIEW` só
-- aceita acrescentar no fim, e pôr no meio devolve "cannot change name of view
-- column".
CREATE OR REPLACE VIEW public.patient_funnel_signals
WITH (security_invoker = on) AS
WITH consultas AS (
  SELECT appointments.patient_id,
     max(appointments.date) FILTER (WHERE appointments.status = 'completed') AS ultima_concluida,
     count(*) FILTER (WHERE appointments.status = 'completed') AS concluidas
    FROM appointments
   WHERE appointments.patient_id IS NOT NULL
   GROUP BY appointments.patient_id
), planos AS (
  SELECT tp.patient_id,
     count(*) FILTER (WHERE tp.status = 'draft') AS em_aberto,
     count(*) FILTER (WHERE tp.status = 'approved' AND (EXISTS ( SELECT 1
            FROM treatment_items ti
           WHERE ti.plan_id = tp.id AND ti.status = 'pending'))) AS em_andamento
    FROM treatment_plans tp
   GROUP BY tp.patient_id
)
SELECT p.id AS patient_id,
   p.owner_id,
   p.unit_id,
   p.name,
   p.phone,
   p.crm_contact_id,
   c.ultima_concluida,
   COALESCE(c.concluidas, 0::bigint) > 0 AS teve_consulta,
   COALESCE(pl.em_aberto, 0::bigint) > 0 AS tem_orcamento_aberto,
   COALESCE(pl.em_andamento, 0::bigint) > 0 AS tem_tratamento_pendente,
   CASE
       WHEN c.ultima_concluida IS NULL THEN NULL::integer
       ELSE CURRENT_DATE - c.ultima_concluida
   END AS dias_sem_consulta,
   COALESCE(c.concluidas, 0::bigint)::int AS consultas_concluidas
  FROM patients p
    LEFT JOIN consultas c ON c.patient_id = p.id
    LEFT JOIN planos pl ON pl.patient_id = p.id;
