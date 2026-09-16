-- Conserta "permission denied for function appointment_recalc_procedures".
--
-- ── O erro ───────────────────────────────────────────────────────────────
--
-- Salvar QUALQUER agendamento estava falhando. O app grava a lista em
-- `appointment_procedures`, o gatilho dispara, e o gatilho faz
-- `PERFORM public.appointment_recalc_procedures(...)`.
--
-- Um gatilho roda com os privilégios de QUEM ESCREVEU a linha — aqui,
-- `authenticated`. O Postgres não checa EXECUTE na função do gatilho em si,
-- mas checa na chamada aninhada. E a migration dos procedimentos revogou
-- justamente esse EXECUTE de `authenticated`.
--
-- O REVOKE foi copiado do módulo da Meta, onde as funções só são chamadas
-- pelo service role. Aqui não é o caso: esta é chamada de dentro de um
-- gatilho que dispara para o usuário comum. Copiar o padrão sem conferir
-- quem chama foi o erro.
--
-- ── Por que SECURITY DEFINER, e não devolver o EXECUTE ───────────────────
--
-- Devolver o EXECUTE resolveria e abriria a função para ser chamada direto
-- por qualquer usuário autenticado, com o id de agendamento que ele
-- quisesse. Com SECURITY DEFINER no gatilho, a chamada aninhada acontece com
-- os privilégios do dono da função, e a função continua fora do alcance de
-- quem não passa pelo gatilho.
--
-- ── E a brecha que isso abriria, fechada aqui ────────────────────────────
--
-- A política RLS de `appointment_procedures` valida `owner_id` e `unit_id`,
-- mas NÃO valida `appointment_id`. Com o gatilho rodando como dono, alguém
-- poderia inserir um item com o próprio `owner_id` apontando para o
-- agendamento de OUTRA clínica, e o recálculo reescreveria o nome e o valor
-- previsto daquele agendamento.
--
-- Por isso o recálculo passa a receber o dono e a filtrar por ele: item
-- apontando para agendamento de outra clínica não atualiza nada.

CREATE OR REPLACE FUNCTION public.appointment_recalc_procedures(
  p_appointment_id uuid,
  p_owner uuid
)
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
  WHERE ap.appointment_id = p_appointment_id
    AND ap.owner_id = p_owner;

  UPDATE public.appointments a
     SET procedure_name = COALESCE(v_nome, 'Consulta'),
         expected_revenue = COALESCE(v_valor, 0),
         procedure_id = (
           SELECT ap.procedure_id FROM public.appointment_procedures ap
            WHERE ap.appointment_id = p_appointment_id
              AND ap.owner_id = p_owner
            ORDER BY ap.position, ap.created_at LIMIT 1
         ),
         updated_at = now()
   -- O filtro de dono é o que impede um item apontado para o agendamento de
   -- outra clínica de reescrever aquele agendamento.
   WHERE a.id = p_appointment_id
     AND a.owner_id = p_owner;
END;
$$;

CREATE OR REPLACE FUNCTION public.appointment_procedures_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.appointment_id IS NOT NULL THEN
    PERFORM public.appointment_recalc_procedures(OLD.appointment_id, OLD.owner_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.appointment_id IS DISTINCT FROM
     (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.appointment_id END) THEN
    PERFORM public.appointment_recalc_procedures(NEW.appointment_id, NEW.owner_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.appointment_recalc_procedures(NEW.appointment_id, NEW.owner_id);
  END IF;
  RETURN NULL;
END;
$$;

-- A versão de um argumento some: ninguém mais a chama, e deixá-la por perto
-- seria deixar a porta que este arquivo veio fechar.
DROP FUNCTION IF EXISTS public.appointment_recalc_procedures(uuid);

REVOKE EXECUTE ON FUNCTION public.appointment_recalc_procedures(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.appointment_recalc_procedures(uuid, uuid) FROM authenticated;
