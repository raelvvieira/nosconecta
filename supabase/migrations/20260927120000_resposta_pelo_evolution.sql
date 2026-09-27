-- A resposta do paciente volta a ser lida — agora pelo WhatsApp da clínica.
--
-- ── O que estava quebrado ────────────────────────────────────────────────
--
-- O lembrete de véspera pede "Responda SIM para confirmar ou NÃO se precisar
-- remarcar". A regra que lê essa resposta existe, está ativa, e nunca rodou
-- uma vez: ela é acordada pelo `whatsapp-inbound-webhook`, que é o webhook do
-- BREVO — e as mensagens passaram a sair pela Evolution. O paciente responde
-- SIM, a mensagem entra na conversa, e a agenda não sabe.
--
-- `appointment_notification_replies` tem zero linhas, e `automation_runs`
-- zero execuções de `whatsapp.reply_received`. Não é um bug sutil: é um
-- caminho inteiro sem ninguém na outra ponta.
--
-- ── Por que o casamento precisa de banco, e não de código ────────────────
--
-- `patients.crm_contact_id` não serve aqui: são 3.248 fichas e ZERO delas
-- guarda um JID da Evolution — o que está ali são ids do CRM antigo, e só em
-- 7 das 21 fichas com consulta marcada. Sobra o telefone.
--
-- E o telefone é texto formatado ("+55 (51) 99335-1821"), não dígito puro.
-- O jeito que o webhook do Brevo fazia era ler `patients` INTEIRO e comparar
-- em memória — o que o PostgREST corta em 1000 linhas caladas. Com 3.248
-- fichas, dois terços dos pacientes nunca seriam encontrados, e ninguém veria
-- erro nenhum: só respostas que não casam.
--
-- Normalizar dentro do banco resolve os dois: a comparação é exata, tem
-- índice, e não passa por nenhum teto de linhas.

-- ── O número normalizado ────────────────────────────────────────────────
--
-- Mesma regra de `normalizeBrazilianPhone` no código: decide pelo
-- COMPRIMENTO, não pelo prefixo. Um número brasileiro tem 12 ou 13 dígitos
-- com o país e 10 ou 11 sem ele, então 10 ou 11 significa que falta o país
-- INCLUSIVE quando começa com 55 — nesse caso o 55 é o DDD (Santa Maria,
-- Uruguaiana, Santana do Livramento), não o código do Brasil.
--
-- IMMUTABLE porque é isso que autoriza o índice abaixo. Ela só olha o
-- argumento: nem tabela, nem relógio, nem `search_path`.
CREATE OR REPLACE FUNCTION public.telefone_br_normalizado(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
           WHEN length(d) IN (10, 11) THEN '55' || d
           ELSE d
         END
  FROM (
    -- UM zero à esquerda, não todos: é exatamente o que
    -- `normalizeBrazilianPhone` faz no código. Divergir aqui por um caractere
    -- significa a tela achando uma ficha e o webhook não achando a mesma.
    SELECT regexp_replace(
             regexp_replace(coalesce(_raw, ''), '\D', '', 'g'),
             '^0', ''
           ) AS d
  ) s;
$$;

COMMENT ON FUNCTION public.telefone_br_normalizado(text) IS
  'Telefone brasileiro em dígitos puros com o 55 na frente. Espelha normalizeBrazilianPhone no código — decide pelo comprimento, nunca pelo prefixo.';

CREATE INDEX IF NOT EXISTS idx_patients_telefone_normalizado
  ON public.patients (public.telefone_br_normalizado(phone))
  WHERE phone IS NOT NULL;

-- ── De um número para o agendamento ─────────────────────────────────────
--
-- Devolve AGENDAMENTOS, não pacientes, e é de propósito.
--
-- 207 números são compartilhados por 447 fichas nesta base — mãe e filho, o
-- mesmo celular em duas fichas com nomes diferentes. Procurar "o paciente
-- deste número" e pegar o primeiro (era o que o código do Brevo fazia, com um
-- `.find()`) confirmaria a consulta da pessoa errada.
--
-- Procurando o agendamento futuro em aberto, a ambiguidade quase desaparece:
-- mãe e filho teriam os dois de ter consulta marcada. Quando ainda assim vier
-- mais de uma linha, quem chama NÃO escolhe — registra e avisa a equipe.
--
-- `pending` e `confirmed` só: responder "sim" não ressuscita consulta
-- cancelada nem reabre atendimento concluído.
CREATE OR REPLACE FUNCTION public.agendamento_por_telefone(
  _owner uuid,
  _variantes text[],
  _hoje date
)
RETURNS TABLE (
  appointment_id uuid,
  patient_id uuid,
  patient_name text,
  data date,
  hora time,
  procedure_name text,
  professional_name text,
  unit_id uuid,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, p.id, p.name, a.date, a.start_time,
         a.procedure_name, a.professional_name, a.unit_id, a.status
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  WHERE a.owner_id = _owner
    AND a.date >= _hoje
    AND a.status IN ('pending', 'confirmed')
    AND public.telefone_br_normalizado(p.phone) = ANY (_variantes)
  ORDER BY a.date, a.start_time
  LIMIT 5;
$$;

-- O webhook chama com a service role, que ignora GRANT — mas a função também
-- serve à tela, e o default do Supabase concede EXECUTE para `anon` em toda
-- função pública. Sem o REVOKE, um `SECURITY DEFINER` fica alcançável sem
-- autenticação nenhuma (ver 20260814143815).
REVOKE EXECUTE ON FUNCTION public.agendamento_por_telefone(uuid, text[], date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.agendamento_por_telefone(uuid, text[], date) TO authenticated, service_role;

-- ── O cron do Brevo sai do ar ───────────────────────────────────────────
--
-- Ele chamava `send-appointment-reminders`, que tentava e-mail, SMS e
-- WhatsApp-do-Brevo para a consulta de amanhã e de hoje. Medido em 26/09: o
-- e-mail é pulado em 25 de 27 tentativas ("Paciente sem e-mail cadastrado" —
-- nenhum dos 23 pacientes com consulta futura tem e-mail); o SMS falha em
-- 100% das 20 tentativas, porque a conta Brevo não tem pacote de SMS
-- contratado; e o WhatsApp do Brevo nunca chegou a ser configurado (número
-- remetente e modelos aprovados ausentes).
--
-- Ou seja: três tentativas por consulta, por dia, para não entregar nada — e
-- a tela de Notificações cheia de "falhou" logo ao lado das automações que
-- estão funcionando. Os avisos passam a sair por um caminho só, o WhatsApp da
-- clínica, que é o que o paciente de fato lê.
--
-- A função continua no projeto, e religá-la é reagendar este cron: se um dia
-- a clínica passar a cadastrar e-mail, ela volta sem reescrever nada.
SELECT cron.unschedule('send-appointment-reminders-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-appointment-reminders-daily');
