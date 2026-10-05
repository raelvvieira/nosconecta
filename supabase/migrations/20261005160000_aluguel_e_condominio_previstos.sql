-- Aluguel e condomínio previstos, out/2026 a dez/2026.
--
-- ── Por que estas linhas existem, e as de imposto não ──────────────────────
--
-- A regra desta base é lançar só fato: imposto, DAS e pró-labore ficaram fora
-- porque são cálculo. Aluguel e condomínio são diferentes e a clínica decidiu
-- prevê-los — são contrato assinado, com valor conhecido e vencimento
-- conhecido. A diferença não é de confiança no número, é de natureza: o imposto
-- depende de um faturamento que ainda não aconteceu; o aluguel vence de novo em
-- 31 de outubro independentemente de qualquer coisa.
--
-- Sem elas o planejamento mentia para baixo em R$ 2.324,91 por mês — um terço
-- do que vai sair. Tudo que havia entrado veio de extrato, e extrato só mostra
-- o que já foi pago; nenhum arquivo falava do futuro.
--
-- ── `source_type = 'previsao-contrato'` ────────────────────────────────────
--
-- Não é `importacao-*`: estas linhas NÃO vêm de arquivo, vêm do padrão de
-- pagamento. Quem ler depois precisa poder separar as duas coisas, e a tela
-- precisa poder marcá-las como previstas. O índice único por origem impede
-- lançar o mesmo mês duas vezes.
--
-- ── As escolhas de valor e de data, e por quê ──────────────────────────────
--
-- VALOR: o último pago de cada boleto, não a média. O condomínio subiu três
-- meses seguidos (582,91 → 583,42 → 616,51) e aluguel não cai. A média daria
-- menos, e errar para baixo numa previsão de pagamento é o erro que dói.
--
-- DATA: o histórico mostra aluguel no fim do mês (pago em 01/10, e as linhas
-- antigas do sistema vencem em 30/06), taxa de condomínio por volta do dia 10
-- e seguro incêndio por volta do dia 15.
--
-- O condomínio são DOIS boletos, não um: taxa (~R$ 465) e seguro incêndio
-- (~R$ 151). Lançar um só valor somado esconderia que são duas cobranças em
-- datas diferentes — e é isso que a pessoa precisa saber para pagar.
--
-- ── Um buraco que fica registrado ──────────────────────────────────────────
--
-- Em sete meses de extrato há só DOIS pagamentos de aluguel: 30/06 (R$ 1.489,75
-- mais R$ 1.293,75, com cara de acerto de atraso) e 01/10 (R$ 1.708,40). Julho,
-- agosto e setembro não aparecem em conta nenhuma que tenhamos. Ou saíram de
-- uma conta que não foi importada, ou o pagamento duplo de junho cobriu dois
-- meses. A previsão daqui para frente está certa; o passado tem essa lacuna.

insert into public.financial_transactions
  (owner_id, unit_id, type, status, description, amount, due_date, category_id,
   supplier_name, is_recurring, recurrence_type, source_type, source_id, notes)
select 'a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134',
       'payable', 'pending', v.descricao, v.valor, v.vence,
       (select id from public.financial_categories
         where owner_id = 'a206246b-a797-48af-93f7-7dc6db3a266d' and name = v.categoria limit 1),
       v.fornecedor, true, 'monthly', 'previsao-contrato', v.chave,
       'Previsão pelo último valor pago (' || v.base || '). Confirmar e ajustar quando o boleto chegar.'
  from (values
    ('Aluguel da Sala', 1708.40, '2026-10-31'::date, 'Aluguel', 'Azevedo Filhos Neg Imob', 'aluguel|2026-10', 'R$ 1.708,40 em 01/10'),
    ('Aluguel da Sala', 1708.40, '2026-11-30', 'Aluguel', 'Azevedo Filhos Neg Imob', 'aluguel|2026-11', 'R$ 1.708,40 em 01/10'),
    ('Aluguel da Sala', 1708.40, '2026-12-31', 'Aluguel', 'Azevedo Filhos Neg Imob', 'aluguel|2026-12', 'R$ 1.708,40 em 01/10'),
    ('Taxa de Condomínio', 465.46, '2026-10-10', 'Aluguel', 'Opportunita Empresarial', 'condominio|2026-10', 'R$ 465,46 em 09/09'),
    ('Taxa de Condomínio', 465.46, '2026-11-10', 'Aluguel', 'Opportunita Empresarial', 'condominio|2026-11', 'R$ 465,46 em 09/09'),
    ('Taxa de Condomínio', 465.46, '2026-12-10', 'Aluguel', 'Opportunita Empresarial', 'condominio|2026-12', 'R$ 465,46 em 09/09'),
    ('Seguro Incêndio', 151.05, '2026-10-15', 'Taxas de Operação', 'Opportunita Empresarial', 'seguro-incendio|2026-10', 'R$ 151,05 em 16/09'),
    ('Seguro Incêndio', 151.05, '2026-11-15', 'Taxas de Operação', 'Opportunita Empresarial', 'seguro-incendio|2026-11', 'R$ 151,05 em 16/09'),
    ('Seguro Incêndio', 151.05, '2026-12-15', 'Taxas de Operação', 'Opportunita Empresarial', 'seguro-incendio|2026-12', 'R$ 151,05 em 16/09')
       ) as v(descricao, valor, vence, categoria, fornecedor, chave, base)
 where not exists (select 1 from public.financial_transactions f
                    where f.source_type = 'previsao-contrato' and f.source_id = v.chave);
