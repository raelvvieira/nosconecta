-- Vários procedimentos num mesmo agendamento.
--
-- ── O problema ────────────────────────────────────────────────────────────
--
-- Um agendamento tinha UM procedimento. Na prática a clínica faz mais de um na
-- mesma sessão — limpeza e restauração, por exemplo — e quem agendava escolhia
-- um e escrevia o resto nas observações, onde nada soma e nada conta.
--
-- ── Por que `appointments.procedure_name` CONTINUA existindo ─────────────
--
-- Ela é lida em vinte arquivos, cinco deles Edge Functions: card do
-- calendário, barra lateral, agenda do celular, tela inicial, lembrete de
-- WhatsApp, automações, Meta CAPI. Trocá-la por uma tabela obrigaria a mexer
-- nos vinte, e cada um seria uma chance nova de quebrar algo que funciona.
--
-- Então ela vira RESUMO: os nomes unidos por " + " ("Limpeza + Restauração").
-- O gatilho abaixo a mantém em dia, e o lembrete de WhatsApp passa a dizer
-- "sua consulta de Limpeza + Restauração" sem uma linha de código novo.
--
-- `expected_revenue` segue a mesma lógica: passa a ser a SOMA dos itens,
-- mantida pelo mesmo gatilho. Ela já era derivada do procedimento escolhido
-- (ver `handleProcedure` no formulário), então nada muda de significado.

CREATE TABLE IF NOT EXISTS public.appointment_procedures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL DEFAULT auth.uid(),
  unit_id          uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  appointment_id   uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  -- Referência ao catálogo, que pode sumir depois. O nome e o preço ficam
  -- gravados aqui de propósito: apagar um procedimento do catálogo não pode
  -- reescrever o que foi combinado com o paciente meses atrás.
  procedure_id     uuid REFERENCES public.clinic_procedures(id) ON DELETE SET NULL,
  procedure_name   text NOT NULL,
  price            numeric(12,2) NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
  -- A ordem que a pessoa escolheu. Sem ela a lista embaralharia a cada
  -- leitura, e o nome resumido mudaria de ordem sozinho.
  position         integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_procedures_agendamento
  ON public.appointment_procedures (appointment_id, position);

-- ── O resumo, mantido pelo banco ─────────────────────────────────────────
--
-- No app isso significaria recalcular em cada caminho de escrita e esquecer em
-- um deles. O banco é o único lugar por onde todas passam — mesmo desenho da
-- soma da fatura do cartão.

CREATE OR REPLACE FUNCTION public.appointment_recalc_procedures(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_nome text;
  v_valor numeric(12,2);
BEGIN
  SELECT
    NULLIF(string_agg(NULLIF(btrim(ap.procedure_name), ''), ' + ' ORDER BY ap.position, ap.created_at), ''),
    COALESCE(SUM(ap.price), 0)
  INTO v_nome, v_valor
  FROM public.appointment_procedures ap
  WHERE ap.appointment_id = p_appointment_id;

  UPDATE public.appointments a
     SET procedure_name = COALESCE(v_nome, 'Consulta'),
         expected_revenue = COALESCE(v_valor, 0),
         -- `procedure_id` continua apontando para o PRIMEIRO, porque é o que
         -- relatórios antigos esperam encontrar ali. A lista é a verdade; esta
         -- coluna é uma conveniência de compatibilidade.
         procedure_id = (
           SELECT ap.procedure_id FROM public.appointment_procedures ap
            WHERE ap.appointment_id = p_appointment_id
            ORDER BY ap.position, ap.created_at LIMIT 1
         ),
         updated_at = now()
   WHERE a.id = p_appointment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.appointment_procedures_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Item que muda de agendamento (não deve acontecer, mas o gatilho não pode
  -- depender disso) recalcula os DOIS — senão o antigo fica inflado.
  IF TG_OP <> 'INSERT' AND OLD.appointment_id IS NOT NULL THEN
    PERFORM public.appointment_recalc_procedures(OLD.appointment_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.appointment_id IS DISTINCT FROM
     (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.appointment_id END) THEN
    PERFORM public.appointment_recalc_procedures(NEW.appointment_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.appointment_recalc_procedures(NEW.appointment_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS appointment_procedures_sync ON public.appointment_procedures;
CREATE TRIGGER appointment_procedures_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.appointment_procedures
  FOR EACH ROW EXECUTE FUNCTION public.appointment_procedures_sync();

-- ── RLS e privilégios ────────────────────────────────────────────────────
--
-- Os GRANTs de tabela não são opcionais: sem eles a política existe e o acesso
-- é negado antes dela. Foi o que faltou na minha migration do cartão e o
-- Lovable teve que consertar.

ALTER TABLE public.appointment_procedures ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
              WHERE schemaname='public' AND tablename='appointment_procedures' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.appointment_procedures;', pol.policyname);
  END LOOP;
  EXECUTE 'CREATE POLICY appointment_procedures_scoped ON public.appointment_procedures '
       || 'FOR ALL TO authenticated '
       || 'USING (public.can_access_row(owner_id, unit_id)) '
       || 'WITH CHECK (public.can_access_row(owner_id, unit_id));';
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_procedures TO authenticated;
GRANT ALL ON public.appointment_procedures TO service_role;

REVOKE EXECUTE ON FUNCTION public.appointment_recalc_procedures(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.appointment_recalc_procedures(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.appointment_procedures_sync() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.appointment_procedures_sync() FROM authenticated;

-- ── Os agendamentos que já existem ───────────────────────────────────────
--
-- Cada um ganha uma linha com o procedimento que já tem. Nenhum dado se perde,
-- e a partir daí a lista é a verdade.
--
-- `WHERE NOT EXISTS` deixa a migration reexecutável sem duplicar itens.
DO $$
DECLARE afetados integer;
BEGIN
  INSERT INTO public.appointment_procedures
    (owner_id, unit_id, appointment_id, procedure_id, procedure_name, price, duration_minutes, position)
  SELECT
    a.owner_id, a.unit_id, a.id, a.procedure_id,
    COALESCE(NULLIF(btrim(a.procedure_name), ''), 'Consulta'),
    COALESCE(a.expected_revenue, 0),
    -- A duração real do agendamento, e não a do catálogo: é o que foi
    -- efetivamente reservado na agenda.
    GREATEST(0, EXTRACT(EPOCH FROM (a.end_time - a.start_time))::int / 60),
    0
  FROM public.appointments a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.appointment_procedures ap WHERE ap.appointment_id = a.id
  );

  GET DIAGNOSTICS afetados = ROW_COUNT;
  RAISE NOTICE 'Agendamentos com procedimento migrado para a lista: %', afetados;
END $$;
