-- Uma linha por origem: a trava de duplicata no financeiro.
--
-- ── Por que no banco, e não no código ──────────────────────────────────────
--
-- A proteção contra duplicata existia em dois lugares, os dois na aplicação:
-- o `WHERE NOT EXISTS` do importador, e a guarda de transição da agenda. As
-- duas funcionam no caminho normal e nenhuma das duas resiste ao caminho
-- torto:
--
--   • rodar o importador de outro jeito, ou um SQL à mão, não passa pelo
--     `WHERE NOT EXISTS`;
--   • concluir o atendimento, voltar o status e concluir de novo passa pela
--     guarda de transição duas vezes — e `createAppointmentReceivable` não
--     tinha trava nenhuma, então saíam dois recebimentos do mesmo atendimento.
--
-- Um índice único é o único lugar por onde TODA escrita passa. Daqui em diante
-- a segunda tentativa é recusada pelo banco, não evitada por quem escreveu o
-- código.
--
-- ── Por que parcial ────────────────────────────────────────────────────────
--
-- `WHERE source_type IS NOT NULL` deixa de fora as linhas lançadas à mão na
-- tela, que não têm origem externa e podem legitimamente repetir: dois pix de
-- R$ 41,00 para a mesma loja no mesmo dia aconteceram de verdade (Lage, 26/09).
-- O índice protege o que foi IMPORTADO ou gerado pelo sistema, que é onde a
-- duplicata é sempre erro.
--
-- ── Conferido antes de criar ───────────────────────────────────────────────
--
-- Em 05/10/2026: 243 linhas com origem, 243 chaves distintas, e zero
-- recebimentos repetidos por (descrição, paciente, vencimento, valor). O
-- índice nasce sem conflito.

create unique index if not exists idx_lancamento_por_origem
  on public.financial_transactions (owner_id, source_type, source_id)
  where source_type is not null;

comment on index public.idx_lancamento_por_origem is
  'Uma linha por origem externa. Impede importar o mesmo movimento de extrato, a mesma parcela de fatura ou o mesmo agendamento duas vezes. Parcial de propósito: lançamento feito à mão (source_type nulo) pode repetir, porque dois pagamentos iguais no mesmo dia existem.';
