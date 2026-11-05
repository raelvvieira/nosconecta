-- Unificar fichas da mesma pessoa.
--
-- A base tem fichas duplicadas do mesmo telefone com o mesmo nome (ou nome
-- parecido: "Gabi", "Gabriela", "Gabriele"). Quando a pessoa se cadastra no
-- Club, tudo vira UMA ficha: agenda, evoluções, arquivos, financeiro, conversa,
-- créditos e etiquetas passam para a ficha mantida, os dados que a mantida não
-- tinha são completados com os das outras, e as repetidas saem.
--
-- Cada ficha removida deixa o retrato completo em `pacientes_unificados`,
-- para dar para conferir ou reconstruir.
--
-- Só o servidor chama (chave de serviço). Nunca mistura clínicas.
CREATE TABLE IF NOT EXISTS public.pacientes_unificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  mantido_id uuid NOT NULL,
  removido_id uuid NOT NULL,
  retrato jsonb NOT NULL,
  em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pacientes_unificados ENABLE ROW LEVEL SECURITY;
-- Sem política: só a chave de serviço lê e grava.
GRANT ALL ON public.pacientes_unificados TO service_role;

CREATE OR REPLACE FUNCTION public.unificar_pacientes(p_manter uuid, p_remover uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_remover uuid[];
  v_n integer;
BEGIN
  SELECT owner_id INTO v_owner FROM public.patients WHERE id = p_manter;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'A ficha a manter não existe.';
  END IF;
  v_remover := array_remove(p_remover, p_manter);
  IF coalesce(array_length(v_remover, 1), 0) = 0 THEN
    RETURN 0;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = ANY(v_remover) AND owner_id IS DISTINCT FROM v_owner
  ) THEN
    RAISE EXCEPTION 'Fichas de clínicas diferentes não se unificam.';
  END IF;

  -- Onde a ficha mantida JÁ tem o mesmo registro, o da repetida é redundante.
  DELETE FROM public.contact_tags d USING public.contact_tags k
   WHERE d.patient_id = ANY(v_remover) AND k.patient_id = p_manter AND k.tag_id = d.tag_id;
  DELETE FROM public.club_creditos d USING public.club_creditos k
   WHERE d.patient_id = ANY(v_remover) AND k.patient_id = p_manter AND k.owner_id = d.owner_id
     AND ((d.tipo = 'boas_vindas' AND k.tipo = 'boas_vindas')
       OR (d.tipo = 'nivel' AND k.tipo = 'nivel'
           AND d.nivel_id IS NOT NULL AND d.nivel_id = k.nivel_id));
  UPDATE public.club_indicacoes d SET indicado_id = NULL
   WHERE d.indicado_id = ANY(v_remover) AND d.status <> 'cancelada'
     AND EXISTS (SELECT 1 FROM public.club_indicacoes k
                  WHERE k.indicado_id = p_manter AND k.owner_id = d.owner_id
                    AND k.status <> 'cancelada');

  -- Tudo o que apontava para as repetidas passa a apontar para a mantida.
  UPDATE public.appointments SET patient_id = p_manter WHERE patient_id = ANY(v_remover);
  UPDATE public.appointment_notification_replies SET patient_id = p_manter WHERE patient_id = ANY(v_remover);
  UPDATE public.clinic_notifications SET patient_id = p_manter WHERE patient_id = ANY(v_remover);
  UPDATE public.club_creditos SET patient_id = p_manter WHERE patient_id = ANY(v_remover);
  UPDATE public.club_indicacoes SET indicador_id = p_manter WHERE indicador_id = ANY(v_remover);
  UPDATE public.club_indicacoes SET indicado_id = p_manter WHERE indicado_id = ANY(v_remover);
  UPDATE public.contact_tags SET patient_id = p_manter WHERE patient_id = ANY(v_remover);
  UPDATE public.financial_transactions SET patient_id = p_manter WHERE patient_id = ANY(v_remover);
  UPDATE public.funnel_cards SET patient_id = p_manter WHERE patient_id = ANY(v_remover);
  UPDATE public.mentoria_reservas SET patient_id = p_manter WHERE patient_id = ANY(v_remover);
  UPDATE public.patient_anamnesis SET patient_id = p_manter WHERE patient_id = ANY(v_remover);
  UPDATE public.patient_files SET patient_id = p_manter WHERE patient_id = ANY(v_remover);
  UPDATE public.patient_notes SET patient_id = p_manter WHERE patient_id = ANY(v_remover);
  UPDATE public.treatment_plans SET patient_id = p_manter WHERE patient_id = ANY(v_remover);
  UPDATE public.wa_contacts SET patient_id = p_manter WHERE patient_id = ANY(v_remover);
  UPDATE public.waiting_list SET patient_id = p_manter WHERE patient_id = ANY(v_remover);

  -- A mantida ganha o que só as repetidas sabiam (o dado dela vence).
  UPDATE public.patients k SET
    email = coalesce(nullif(k.email, ''), d.email),
    cpf = coalesce(nullif(k.cpf, ''), d.cpf),
    birth_date = coalesce(k.birth_date, d.birth_date),
    gender = coalesce(nullif(k.gender, ''), d.gender),
    neighborhood = coalesce(nullif(k.neighborhood, ''), d.neighborhood),
    zip_code = coalesce(nullif(k.zip_code, ''), d.zip_code),
    city = coalesce(nullif(k.city, ''), d.city),
    address = coalesce(nullif(k.address, ''), d.address),
    state = coalesce(nullif(k.state, ''), d.state),
    address_complement = coalesce(nullif(k.address_complement, ''), d.address_complement),
    allergy_notes = coalesce(nullif(k.allergy_notes, ''), d.allergy_notes),
    notes = CASE
      WHEN nullif(k.notes, '') IS NULL THEN d.notes
      WHEN nullif(d.notes, '') IS NULL OR k.notes LIKE '%' || d.notes || '%' THEN k.notes
      ELSE k.notes || E'\n' || d.notes END,
    guardian_name = coalesce(nullif(k.guardian_name, ''), d.guardian_name),
    guardian_cpf = coalesce(nullif(k.guardian_cpf, ''), d.guardian_cpf),
    responsible_professional_id = coalesce(k.responsible_professional_id, d.responsible_professional_id),
    crm_contact_id = coalesce(k.crm_contact_id, d.crm_contact_id),
    photo_path = coalesce(k.photo_path, d.photo_path),
    updated_at = now()
  FROM (
    SELECT
      max(email) AS email, max(cpf) AS cpf, max(birth_date) AS birth_date,
      max(gender) AS gender, max(neighborhood) AS neighborhood, max(zip_code) AS zip_code,
      max(city) AS city, max(address) AS address, max(state) AS state,
      max(address_complement) AS address_complement, max(allergy_notes) AS allergy_notes,
      string_agg(nullif(notes, ''), E'\n') AS notes, max(guardian_name) AS guardian_name,
      max(guardian_cpf) AS guardian_cpf,
      (array_agg(responsible_professional_id) FILTER (WHERE responsible_professional_id IS NOT NULL))[1] AS responsible_professional_id,
      max(crm_contact_id) AS crm_contact_id, max(photo_path) AS photo_path
    FROM public.patients WHERE id = ANY(v_remover)
  ) d
  WHERE k.id = p_manter;

  INSERT INTO public.pacientes_unificados (owner_id, mantido_id, removido_id, retrato)
  SELECT v_owner, p_manter, p.id, to_jsonb(p) FROM public.patients p WHERE p.id = ANY(v_remover);

  DELETE FROM public.patients WHERE id = ANY(v_remover);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.unificar_pacientes(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unificar_pacientes(uuid, uuid[]) TO service_role;
COMMENT ON FUNCTION public.unificar_pacientes IS
  'Junta fichas da mesma pessoa numa só: move o histórico e completa os dados; só a chave de serviço chama.';
