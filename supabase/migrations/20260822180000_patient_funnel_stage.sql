-- Etapa de cada paciente no funil de Clientes.
--
-- O funil de Clientes é a base INTEIRA, e a etapa é calculada, não arrastada.
-- Fazer essa conta no navegador exigiria trazer todos os pacientes, todos os
-- planos, todos os itens e todas as consultas para decidir seis colunas —
-- inviável já em algumas centenas de pacientes. Aqui é uma varredura só, com os
-- índices que já existem.
--
-- VIEW e não coluna materializada de propósito: a etapa muda sozinha quando o
-- paciente é atendido ou o orçamento é aprovado. Uma coluna gravada precisaria
-- de gatilho em quatro tabelas e envelheceria calada na primeira que faltasse.

CREATE OR REPLACE VIEW public.patient_funnel_stage AS
WITH consultas AS (
  SELECT
    patient_id,
    MAX(date) FILTER (WHERE status = 'completed') AS ultima_concluida,
    COUNT(*) FILTER (WHERE status = 'completed')  AS concluidas
  FROM public.appointments
  WHERE patient_id IS NOT NULL
  GROUP BY patient_id
),
planos AS (
  SELECT
    tp.patient_id,
    -- Orçamento apresentado e ainda não decidido.
    COUNT(*) FILTER (WHERE tp.status = 'draft') AS em_aberto,
    -- Aprovado com pelo menos um item por fazer.
    COUNT(*) FILTER (
      WHERE tp.status = 'approved'
        AND EXISTS (
          SELECT 1 FROM public.treatment_items ti
          WHERE ti.plan_id = tp.id AND ti.status = 'pending'
        )
    ) AS em_andamento
  FROM public.treatment_plans tp
  GROUP BY tp.patient_id
)
SELECT
  p.id             AS patient_id,
  p.owner_id,
  p.unit_id,
  p.name,
  p.phone,
  p.crm_contact_id,
  c.ultima_concluida,
  CASE
    -- A ORDEM é a regra de negócio, não detalhe de implementação: cada
    -- paciente cai na primeira que casar, e a lista está ordenada por quanto
    -- aquele estado pede ação da clínica.

    -- 1. Nunca foi atendido. Vem antes de tudo porque a primeira consulta é o
    --    momento de maior risco de perder a pessoa.
    WHEN COALESCE(c.concluidas, 0) = 0 THEN 'novo'

    -- 2. Dinheiro na mesa: orçamento apresentado e sem resposta.
    WHEN COALESCE(pl.em_aberto, 0) > 0 THEN 'orcamento_aberto'

    -- 3. Tratamento aprovado que PAROU. Antes de "em tratamento" de propósito:
    --    é o caso que precisa de alguém ligando, e ficaria escondido se caísse
    --    na mesma coluna de quem está fluindo normalmente.
    WHEN COALESCE(pl.em_andamento, 0) > 0
     AND c.ultima_concluida < CURRENT_DATE - INTERVAL '60 days' THEN 'tratamento_parado'

    -- 4. Tratamento aprovado e andando. Não pede ação nenhuma.
    WHEN COALESCE(pl.em_andamento, 0) > 0 THEN 'em_tratamento'

    -- 5. Sumiu, e não há nada pendente que explique o sumiço.
    WHEN c.ultima_concluida < CURRENT_DATE - INTERVAL '6 months' THEN 'inativo'

    -- 6. Em dia, sem pendência.
    ELSE 'manutencao'
  END AS stage
FROM public.patients p
LEFT JOIN consultas c ON c.patient_id = p.id
LEFT JOIN planos  pl ON pl.patient_id = p.id;
-- Sem filtro nenhum: a base INTEIRA entra no funil, que é o que torna cada
-- coluna um público de campanha utilizável.
--
-- E de propósito nada aqui olha `patients.status` (active / in_treatment /
-- return_pending / delinquent / inactive). Aquele campo é preenchido à mão e
-- envelhece parado — é exatamente o problema que este cálculo existe para
-- evitar. Deixar os dois convivendo, um manual e um calculado, faria a clínica
-- ver dois valores diferentes para a mesma pergunta.

-- `security_invoker` faz a view rodar com a permissão de QUEM CONSULTA, então
-- a RLS de `patients` continua valendo através dela. Sem isso a view rodaria
-- como o dono do objeto e vazaria paciente de outra clínica — é o erro clássico
-- de view sobre tabela com RLS.
ALTER VIEW public.patient_funnel_stage SET (security_invoker = on);

GRANT SELECT ON public.patient_funnel_stage TO authenticated;

-- Contagem por coluna, num acesso só.
--
-- Existe porque o PostgREST não agrupa: sem esta view, contar as seis colunas
-- seria ou seis consultas de `count`, ou trazer todas as linhas para contar no
-- servidor da aplicação. A segunda opção é pior do que parece — o PostgREST
-- devolve no máximo 1000 linhas por padrão, então acima de mil pacientes as
-- contagens sairiam MENORES do que a realidade, sem erro nenhum.
CREATE OR REPLACE VIEW public.patient_funnel_counts AS
SELECT owner_id, unit_id, stage, COUNT(*)::int AS total
FROM public.patient_funnel_stage
GROUP BY owner_id, unit_id, stage;

ALTER VIEW public.patient_funnel_counts SET (security_invoker = on);
GRANT SELECT ON public.patient_funnel_counts TO authenticated;
