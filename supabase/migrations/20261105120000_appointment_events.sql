-- Histórico do que acontece com um agendamento: remarcou e mudou de situação.
--
-- Hoje remarcar é editar a data na mesma linha, e cancelar é trocar o status:
-- nada fica registrado, então "quantos remarcaram" e "quanto antes cancelaram"
-- não têm resposta. Um gatilho no próprio banco grava isso, de qualquer caminho
-- que altere o agendamento (agenda, chat, automações), sem depender de cada
-- tela lembrar de registrar.
--
-- Só vale daqui para a frente: o passado não tem como ser reconstruído.
CREATE TABLE IF NOT EXISTS public.appointment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('remarcou', 'status')),
  from_date date,
  to_date date,
  from_time time,
  to_time time,
  from_status text,
  to_status text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointment_events_owner_at
  ON public.appointment_events (owner_id, at);
CREATE INDEX IF NOT EXISTS appointment_events_appointment
  ON public.appointment_events (appointment_id);

ALTER TABLE public.appointment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_events_do_consultorio ON public.appointment_events;
CREATE POLICY appointment_events_do_consultorio ON public.appointment_events
  FOR SELECT TO authenticated
  USING (public.can_access_row(owner_id));

CREATE OR REPLACE FUNCTION public.registrar_evento_do_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ajuste logo depois de criar (erro de digitação) não é remarcação.
  IF NEW.created_at > now() - interval '10 minutes' THEN
    RETURN NEW;
  END IF;

  IF NEW.date IS DISTINCT FROM OLD.date OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    INSERT INTO public.appointment_events
      (owner_id, appointment_id, kind, from_date, to_date, from_time, to_time)
    VALUES
      (NEW.owner_id, NEW.id, 'remarcou', OLD.date, NEW.date, OLD.start_time, NEW.start_time);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.appointment_events
      (owner_id, appointment_id, kind, from_status, to_status, from_date, to_date)
    VALUES
      (NEW.owner_id, NEW.id, 'status', OLD.status, NEW.status, NEW.date, NEW.date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_registrar_evento ON public.appointments;
CREATE TRIGGER appointments_registrar_evento
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.registrar_evento_do_agendamento();

COMMENT ON TABLE public.appointment_events IS
  'Remarcações e mudanças de situação dos agendamentos, gravadas por gatilho.';
