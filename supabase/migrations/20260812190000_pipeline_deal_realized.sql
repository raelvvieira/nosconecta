-- Quando um negócio é dado como ganho, ele passa a valer como atendimento
-- realizado: tem um dia em que aconteceu e um valor cobrado.
--
-- `realized_on` é a data informada por quem confirmou, não o `updated_at` da
-- linha. São coisas diferentes — marcar hoje um atendimento de terça é o caso
-- comum, e é justamente essa data que decide se a conversão já foi enviada.
--
-- `appointment_id` é o atendimento concluído criado na Agenda a partir deste
-- ganho. Sem ele, o painel do funil só conseguiria afirmar que consolidou; com
-- ele, consegue mostrar qual atendimento é. Sem FK de propósito: apagar um
-- agendamento não pode derrubar o histórico da negociação.
alter table public.pipeline_deals
  add column if not exists realized_on date,
  add column if not exists appointment_id uuid;

-- A pergunta que esta tabela passa a responder é "o que foi ganho no dia X",
-- sempre dentro de um dono.
create index if not exists idx_pipeline_deals_owner_realized
  on public.pipeline_deals (owner_id, realized_on);
