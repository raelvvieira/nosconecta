-- Telefone de paciente sempre com o código do país, na raiz.
--
-- O problema: um telefone salvo sem o "55" (ex.: "51993351821", DDD 51 sem o
-- país) faz o CRM ler o "51" como código do Peru, criar um contato peruano, e
-- o disparo sai marcado como enviado sem nunca chegar. Falha silenciosa: a
-- cota do dia é debitada, o painel fica verde, a pessoa não recebe nada.
--
-- A aplicação já normalizava na gravação, mas em dois runtimes separados (o
-- app em src/ e as Edge Functions em Deno) — e uma terceira escrita (uma
-- importação, uma tela nova, código gerado pelo Lovable) nasceria sem essa
-- proteção sem que ninguém percebesse. O único ponto por onde TODA escrita
-- passa é o banco, então é aqui que a regra tem que morar.
--
-- Escopo: `patients.phone`, que é a origem de quem recebe disparo. As outras
-- colunas de telefone do schema (clinic_units, profiles) são de exibição e não
-- alimentam o CRM; `whatsapp_broadcast_targets.phone` é cópia do momento do
-- envio, derivada desta.

-- ── A regra ─────────────────────────────────────────────────────────────────
--
-- Decide pelo COMPRIMENTO, não por "já começa com 55". Um número brasileiro
-- tem 12 ou 13 dígitos com o país (55 + DDD + 8 ou 9) e 10 ou 11 sem ele.
-- Logo, 10 ou 11 dígitos significa que falta o país — INCLUSIVE quando começa
-- com 55, porque aí o 55 é o DDD (Santa Maria, Uruguaiana, Santana do
-- Livramento) e não o Brasil. Foi exatamente esse caso que a regra anterior,
-- baseada no prefixo, pulava calada.
--
-- Número curto demais para ter DDD sai intocado: sem DDD não há como adivinhar
-- a região, e prefixar "55" só disfarçaria de válido algo que não é.
CREATE OR REPLACE FUNCTION public.normalize_br_phone(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(raw, '\D', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  IF left(d, 1) = '0' THEN d := substr(d, 2); END IF;   -- 0 de tronco
  IF length(d) IN (10, 11) THEN d := '55' || d; END IF;
  RETURN d;
END;
$$;

-- ── O trigger ───────────────────────────────────────────────────────────────
--
-- Normaliza em vez de recusar, deliberadamente: um CHECK que rejeitasse a
-- escrita transformaria "telefone digitado torto" em erro no meio de um
-- cadastro, e a recepcionista perderia o formulário por causa de um traço.
-- Corrigir calado é o comportamento certo aqui — o número certo é dedutível,
-- então não há decisão a pedir a ninguém.
CREATE OR REPLACE FUNCTION public.patients_normalize_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.phone := public.normalize_br_phone(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_normalize_phone ON public.patients;
CREATE TRIGGER patients_normalize_phone
  BEFORE INSERT OR UPDATE OF phone ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.patients_normalize_phone();

-- ── As linhas que já estão erradas ──────────────────────────────────────────
--
-- Isto é o que o botão "Corrigir telefones sem código do país" fazia à mão, só
-- que de uma vez e sem depender de alguém lembrar de clicar.
--
-- `crm_contact_id` é zerado SÓ quando os dígitos mudam de verdade: aí o contato
-- que existe hoje no CRM foi criado a partir do número errado (o brasileiro
-- virou peruano) e o vínculo precisa ser esquecido para ser refeito certo no
-- próximo disparo. Quando a única mudança é sumir a pontuação — "(51)
-- 99687-9727" virando "5551996879727" —, o número sempre foi o mesmo e o
-- vínculo continua bom; zerar ali só geraria uma ida ao CRM à toa.
DO $$
DECLARE
  afetados integer;
BEGIN
  UPDATE public.patients p
  SET
    phone = public.normalize_br_phone(p.phone),
    crm_contact_id = CASE
      WHEN regexp_replace(p.phone, '\D', '', 'g')
             IS DISTINCT FROM public.normalize_br_phone(p.phone)
        THEN NULL
      ELSE p.crm_contact_id
    END
  WHERE p.phone IS NOT NULL
    AND public.normalize_br_phone(p.phone) IS DISTINCT FROM p.phone;

  GET DIAGNOSTICS afetados = ROW_COUNT;
  RAISE NOTICE 'Telefones de paciente normalizados: %', afetados;
END;
$$;
