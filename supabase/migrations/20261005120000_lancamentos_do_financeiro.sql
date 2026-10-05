-- Lançamentos do financeiro: extrato e faturas de cartão de maio a outubro de 2026.
--
-- Gerado por `scripts/importar-financeiro.mjs --sql`. Idempotente: cada linha nova
-- carrega `source_type`/`source_id` com a chave da origem, e todo INSERT é guardado
-- por `WHERE NOT EXISTS` nessa chave.
--
-- A ORDEM DOS BLOCOS É OBRIGATÓRIA: o gatilho `card_purchase_freeze` recusa compra
-- nova em fatura cuja linha de pagamento já esteja `paid`. As faturas são quitadas
-- no último bloco, depois de todas as parcelas entrarem.

-- ── 1. As faturas de cada ciclo ────────────────────────────────────────────
--
-- O índice único (card_id, closing_date) é o que faz esta inserção poder rodar
-- de novo sem duplicar — é o mesmo que resolve a corrida de duas compras
-- simultâneas no app.

insert into public.card_invoices (owner_id, unit_id, card_id, closing_date, due_date) values
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2026-05-13', '2026-05-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2026-06-13', '2026-06-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2026-07-13', '2026-07-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2026-08-13', '2026-08-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c', '2026-09-11', '2026-09-16'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2026-09-13', '2026-09-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c', '2026-10-11', '2026-10-16'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2026-10-13', '2026-10-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c', '2026-11-11', '2026-11-16'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2026-11-13', '2026-11-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c', '2026-12-11', '2026-12-16'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2026-12-13', '2026-12-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c', '2027-01-11', '2027-01-16'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2027-01-13', '2027-01-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c', '2027-02-11', '2027-02-16'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2027-02-13', '2027-02-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c', '2027-03-11', '2027-03-16'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2027-03-13', '2027-03-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c', '2027-04-11', '2027-04-16'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2027-04-13', '2027-04-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c', '2027-05-11', '2027-05-16'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2027-05-13', '2027-05-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c', '2027-06-11', '2027-06-16'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2027-06-13', '2027-06-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c', '2027-07-11', '2027-07-16'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2027-07-13', '2027-07-20'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c', '2027-08-11', '2027-08-16'),
  ('a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', '2027-08-13', '2027-08-20')
on conflict (card_id, closing_date) do nothing;

-- ── 2. A linha de pagamento de cada fatura ────────────────────────────────
--
-- Nasce com valor zero: `card_invoice_recalc`, disparado pela primeira compra,
-- a preenche. Sem esta linha o gatilho não teria alvo e a fatura não apareceria
-- em Pagamentos.
--
-- Um statement para todas, e não um por fatura: o rótulo e a conta saem do
-- cadastro do cartão, então vinte e oito linhas seriam vinte e oito cópias da
-- mesma regra — e uma delas divergiria no dia em que o nome do cartão mudasse.

insert into public.financial_transactions (owner_id, unit_id, type, status, description, amount, due_date, account_id, payment_method, settles_card_invoice_id, credit_card_id)
select i.owner_id, i.unit_id, 'payable', 'pending',
       'Fatura ' || c.name || ' · ' || (array['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'])[extract(month from i.due_date)::int] || '/' || extract(year from i.due_date)::text,
       0, i.due_date, c.account_id, 'fatura', i.id, i.card_id
  from public.card_invoices i
  join public.credit_cards c on c.id = i.card_id
 where i.owner_id = 'a206246b-a797-48af-93f7-7dc6db3a266d'
   and not exists (select 1 from public.financial_transactions f where f.settles_card_invoice_id = i.id);

-- ── 3. As compras no cartão, uma linha por parcela ────────────────────────
--
-- `status` fica `pending` de propósito, mesmo nas parcelas de fatura já paga:
-- compra no cartão não é saída de caixa (`soCaixa` a exclui de todo indicador
-- de caixa). Quem sai do caixa é a fatura, no bloco 9.
--
-- O valor é o da parcela COMO ESTÁ NA FATURA, e não o total dividido por N: a
-- IR Tintas cobra R$ 362,97 na primeira e R$ 362,89 na segunda, e dividir
-- deixaria a fatura sem fechar ao centavo.
--
-- A regra aparece UMA vez e os dados vêm como tabela. Cento e sessenta e nove
-- statements iguais seriam cento e sessenta e nove chances de um divergir, e
-- ninguém revisa isso lendo. Assim o que se revisa é a lista de compras.
--
-- Vencimento, unidade e conta NÃO estão na tabela: saem da fatura e do cadastro
-- do cartão, pela junção. É o que garante que a parcela caia na mesma fatura que
-- o app criaria.

-- parcelas 1 a 45 de 169
insert into public.financial_transactions (owner_id, unit_id, type, status, description, amount, due_date, purchase_date, card_invoice_id, credit_card_id, purchase_group_id, installment_number, installment_total, category_id, supplier_name, account_id, payment_method, source_type, source_id)
select 'a206246b-a797-48af-93f7-7dc6db3a266d', c.unit_id, 'payable', 'pending', v.descricao, v.valor,
       i.due_date, v.comprada_em, i.id, c.id, v.grupo,
       case when v.parcelas > 1 then v.parcela end,
       case when v.parcelas > 1 then v.parcelas end,
       (select id from public.financial_categories where owner_id = 'a206246b-a797-48af-93f7-7dc6db3a266d' and name = v.categoria limit 1),
       v.fornecedor, c.account_id, 'credito', 'importacao-fatura', v.chave
  from (values
    ('Anúncios', 78.27, '2026-04-13'::date, 1, 1, 'Anúncios', 'Meta', 'Inter|FACEBK 4N9MKHD5A2|2026-04-13|1|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '2982046e-f617-58f7-8162-75a60799709b'::uuid, '2026-05-13'::date),
    ('Calção do aluguel', 196.00, '2026-04-13'::date, 1, 1, 'Taxas de Operação', 'Azevedo Filhos Neg Imob', 'Inter|IG CREDALUGA|2026-04-13|1|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '940dd5bf-f774-531e-8789-5f0395c84bd7'::uuid, '2026-05-13'::date),
    ('Calção do aluguel', 180.00, '2026-04-13'::date, 1, 1, 'Taxas de Operação', 'Azevedo Filhos Neg Imob', 'Inter|IG CREDALUGA|2026-04-13|1|1|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '6ab48131-4399-56f1-bbf7-cd08636e9d08'::uuid, '2026-05-13'::date),
    ('Seguro do cartão', 5.90, '2026-04-21'::date, 1, 1, 'Taxas de Operação', 'Banco Inter', 'Inter|SEGURO CARTAO CTP|2026-04-21|1|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'c13d50c6-a7bb-5425-9c71-c4c420e3e435'::uuid, '2026-05-13'::date),
    ('Seguro do cartão', 5.90, '2026-05-21'::date, 1, 1, 'Taxas de Operação', 'Banco Inter', 'Inter|SEGURO CARTAO CTP|2026-05-21|1|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '1ccb1c83-3e46-5284-969e-718bba132534'::uuid, '2026-06-13'::date),
    ('Seguro do cartão', 5.90, '2026-06-21'::date, 1, 1, 'Taxas de Operação', 'Banco Inter', 'Inter|SEGURO CARTAO CTP|2026-06-21|1|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '18acde0e-9bf9-583e-a06e-a2134c0705e9'::uuid, '2026-07-13'::date),
    ('Seguro do cartão', 5.90, '2026-07-21'::date, 1, 1, 'Taxas de Operação', 'Banco Inter', 'Inter|SEGURO CARTAO CTP|2026-07-21|1|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '2b5ff48a-44a1-57ab-9407-b26b0df01b53'::uuid, '2026-08-13'::date),
    ('Tintas da sala (1/10)', 362.97, '2026-08-07'::date, 1, 10, 'Material de Construção', 'IR Comércio de Tintas', 'Inter|IR COMERCIO DE TINTAS|2026-08-07|10|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'be7397ae-3181-5378-a1ca-c9719ba6ac3d'::uuid, '2026-08-13'::date),
    ('Cadeiras da sala (1/12)', 60.82, '2026-09-05'::date, 1, 12, 'Móveis', 'DunaMobi', 'Mercado Pago|MP DUNAMOBI0012609322629|2026-09-05|12|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bd1dce84-9ec9-5b07-8723-52960c6d38ed'::uuid, '2026-09-11'::date),
    ('Frigobar da sala (1/8)', 60.60, '2026-09-04'::date, 1, 8, 'Equipamentos', 'Electrolux (Shopee)', 'Mercado Pago|SHOPEE ELECTROLUX|2026-09-04|8|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'dc4654d4-6832-5e02-939c-d6f8e731f114'::uuid, '2026-09-11'::date),
    ('LED da sala', 31.25, '2026-08-28'::date, 1, 1, 'Material de Construção', 'Luminiart (Mercado Livre)', 'Mercado Pago|MERCADOLIVRE LUMINIART|2026-08-28|1|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '6ce6434c-62f7-542f-ac12-ac552a9bbd87'::uuid, '2026-09-11'::date),
    ('Limpeza, suportes e manutenção da sala', 71.14, '2026-09-02'::date, 1, 1, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLI|2026-09-02|1|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '8ca1dbeb-d232-533b-97fb-e84ca07b4751'::uuid, '2026-09-11'::date),
    ('Limpeza, suportes e manutenção da sala (1/10)', 45.07, '2026-09-05'::date, 1, 10, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|10|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '323ffd10-199e-55e5-97f8-62fd4c780504'::uuid, '2026-09-11'::date),
    ('Limpeza, suportes e manutenção da sala (1/12)', 95.89, '2026-08-27'::date, 1, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-27|12|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '751478ea-9c7b-597e-bb39-7ec05df9c712'::uuid, '2026-09-11'::date),
    ('Limpeza, suportes e manutenção da sala (1/12)', 75.37, '2026-08-31'::date, 1, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-31|12|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '4cd00499-176b-5062-8c39-3f56e4bcf968'::uuid, '2026-09-11'::date),
    ('Limpeza, suportes e manutenção da sala (1/3)', 22.17, '2026-09-04'::date, 1, 3, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-04|3|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '8e50af90-60f4-591c-a638-42a83bac1786'::uuid, '2026-09-11'::date),
    ('Limpeza, suportes e manutenção da sala (1/3)', 33.56, '2026-09-10'::date, 1, 3, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-10|3|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '94473c57-03e0-560d-9a3f-77de9b003b07'::uuid, '2026-09-11'::date),
    ('Limpeza, suportes e manutenção da sala (1/4)', 15.02, '2026-09-05'::date, 1, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|4|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bf4a3a33-0843-5d4c-8519-66d6410e03d9'::uuid, '2026-09-11'::date),
    ('Limpeza, suportes e manutenção da sala (1/4)', 15.02, '2026-09-08'::date, 1, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-08|4|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '55cc35a0-f0d0-55d2-9f35-5dfb79993d0c'::uuid, '2026-09-11'::date),
    ('Limpeza, suportes e manutenção da sala (1/4)', 11.23, '2026-08-20'::date, 1, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-20|4|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '53285506-f469-53ed-974f-d00274ef4bf8'::uuid, '2026-09-11'::date),
    ('Limpeza, suportes e manutenção da sala (1/4)', 104.75, '2026-08-20'::date, 1, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-20|4|1|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'c1ff3b7c-580b-51e7-8dff-45729e747492'::uuid, '2026-09-11'::date),
    ('Limpeza, suportes e manutenção da sala (1/8)', 10.88, '2026-08-28'::date, 1, 8, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-28|8|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'aee4f1be-0a02-5734-99a0-2b335e3d2de6'::uuid, '2026-09-11'::date),
    ('Limpeza, suportes e manutenção da sala (2/3)', 22.16, '2026-09-04'::date, 2, 3, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-04|3|0|2', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '8e50af90-60f4-591c-a638-42a83bac1786'::uuid, '2026-09-11'::date),
    ('Limpeza, suportes e manutenção da sala (3/3)', 22.16, '2026-09-04'::date, 3, 3, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-04|3|0|3', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '8e50af90-60f4-591c-a638-42a83bac1786'::uuid, '2026-09-11'::date),
    ('Luminária da sala (1/8)', 21.51, '2026-09-10'::date, 1, 8, 'Material de Construção', 'Âncora (Mercado Livre)', 'Mercado Pago|MERCADOLIVRE ANCORA|2026-09-10|8|0|1', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '090cb72a-cdd3-51b0-baed-f85ebbe97769'::uuid, '2026-09-11'::date),
    ('Acabamento da sala (1/3)', 63.25, '2026-08-20'::date, 1, 3, 'Material de Construção', 'AçoDecor (Shopee)', 'Inter|SHOPEE ACODECOR|2026-08-20|3|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'f2b009b8-dd24-5885-b58f-fafdcaa8877b'::uuid, '2026-09-13'::date),
    ('Bancada da sala (1/5)', 980.00, '2026-08-18'::date, 1, 5, 'Material de Construção', 'Marmoraria Passos', 'Inter|MARMORARIA PASSOS|2026-08-18|5|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '70ae85f8-4f3f-570f-9173-fb253e5d0a1a'::uuid, '2026-09-13'::date),
    ('Equipamento da sala (1/12)', 71.49, '2026-08-28'::date, 1, 12, 'Equipamentos', 'Webcontinental (Shopee)', 'Inter|SHOPEE WEBCONTINENTAL|2026-08-28|12|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'b14c9e36-a4d6-5b61-9d2d-fac1cf19d194'::uuid, '2026-09-13'::date),
    ('Espelhos da sala (1/10)', 72.00, '2026-08-27'::date, 1, 10, 'Móveis', 'Outlet dos Espelhos (Shopee)', 'Inter|SHOPEE OUTLETDOSESPEL|2026-08-27|10|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '57b02d6b-dc04-59ac-9661-5db8de79f0c2'::uuid, '2026-09-13'::date),
    ('Iluminação da sala (1/4)', 106.04, '2026-08-20'::date, 1, 4, 'Material de Construção', 'Divina Luz (Shopee)', 'Inter|SHOPEE DIVINALUZOFICI|2026-08-20|4|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'c1414128-fd1f-5af6-8d24-fc327ea70152'::uuid, '2026-09-13'::date),
    ('Itens operacionais da sala (1/4)', 40.51, '2026-09-05'::date, 1, 4, 'Material de Consumo', 'Shopee', 'Inter|SHOPEE 50487836 AUGUST|2026-09-05|4|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '8376877e-8589-5293-bcad-aca486503890'::uuid, '2026-09-13'::date),
    ('Limpeza, suportes e manutenção da sala (1/3)', 82.05, '2026-08-20'::date, 1, 3, 'Material de Consumo', 'Mercado Livre', 'Inter|MERCADOLIVRE MERCADOL|2026-08-20|3|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '88fee847-3a04-502f-8b1a-521057f2b38e'::uuid, '2026-09-13'::date),
    ('Móveis da sala (1/7)', 162.90, '2026-08-24'::date, 1, 7, 'Móveis', 'MadeiraMadeira', 'Inter|MADEIRAMAD TUCASHOP|2026-08-24|7|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '06652329-f581-56c4-804c-9f39add6594e'::uuid, '2026-09-13'::date),
    ('Móveis planejados da sala (1/4)', 537.82, '2026-08-25'::date, 1, 4, 'Móveis', 'Qualitate', 'Inter|MP QUALITATE|2026-08-25|4|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'c94717fe-eb22-5e8e-a789-0a40e3f11bd3'::uuid, '2026-09-13'::date),
    ('Seguro do cartão', 5.90, '2026-08-21'::date, 1, 1, 'Taxas de Operação', 'Banco Inter', 'Inter|SEGURO CARTAO CTP|2026-08-21|1|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '947487a9-578e-51c9-9452-9f17879b1155'::uuid, '2026-09-13'::date),
    ('Tintas da sala (2/10)', 362.89, '2026-08-07'::date, 2, 10, 'Material de Construção', 'IR Comércio de Tintas', 'Inter|IR COMERCIO DE TINTAS|2026-08-07|10|0|2', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'be7397ae-3181-5378-a1ca-c9719ba6ac3d'::uuid, '2026-09-13'::date),
    ('Torneiras da sala (1/5)', 86.75, '2026-08-23'::date, 1, 5, 'Material de Construção', 'DastyShop (Shopee)', 'Inter|SHOPEE DASTYSHOP|2026-08-23|5|0|1', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'a1164ba7-91b1-5642-a8b3-5f7826e06715'::uuid, '2026-09-13'::date),
    ('Cadeiras da sala (2/12)', 60.82, '2026-09-05'::date, 2, 12, 'Móveis', 'DunaMobi', 'Mercado Pago|MP DUNAMOBI0012609322629|2026-09-05|12|0|2', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bd1dce84-9ec9-5b07-8723-52960c6d38ed'::uuid, '2026-10-11'::date),
    ('Frigobar da sala (2/8)', 60.60, '2026-09-04'::date, 2, 8, 'Equipamentos', 'Electrolux (Shopee)', 'Mercado Pago|SHOPEE ELECTROLUX|2026-09-04|8|0|2', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'dc4654d4-6832-5e02-939c-d6f8e731f114'::uuid, '2026-10-11'::date),
    ('Limpeza, suportes e manutenção da sala (2/10)', 45.07, '2026-09-05'::date, 2, 10, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|10|0|2', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '323ffd10-199e-55e5-97f8-62fd4c780504'::uuid, '2026-10-11'::date),
    ('Limpeza, suportes e manutenção da sala (2/12)', 95.89, '2026-08-27'::date, 2, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-27|12|0|2', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '751478ea-9c7b-597e-bb39-7ec05df9c712'::uuid, '2026-10-11'::date),
    ('Limpeza, suportes e manutenção da sala (2/12)', 75.37, '2026-08-31'::date, 2, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-31|12|0|2', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '4cd00499-176b-5062-8c39-3f56e4bcf968'::uuid, '2026-10-11'::date),
    ('Limpeza, suportes e manutenção da sala (2/3)', 33.56, '2026-09-10'::date, 2, 3, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-10|3|0|2', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '94473c57-03e0-560d-9a3f-77de9b003b07'::uuid, '2026-10-11'::date),
    ('Limpeza, suportes e manutenção da sala (2/4)', 15.02, '2026-09-05'::date, 2, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|4|0|2', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bf4a3a33-0843-5d4c-8519-66d6410e03d9'::uuid, '2026-10-11'::date),
    ('Limpeza, suportes e manutenção da sala (2/4)', 15.02, '2026-09-08'::date, 2, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-08|4|0|2', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '55cc35a0-f0d0-55d2-9f35-5dfb79993d0c'::uuid, '2026-10-11'::date)
       ) as v(descricao, valor, comprada_em, parcela, parcelas, categoria, fornecedor, chave, cartao, grupo, fechamento)
  join public.credit_cards c on c.id = v.cartao
  join public.card_invoices i on i.card_id = v.cartao and i.closing_date = v.fechamento
 where not exists (select 1 from public.financial_transactions f where f.source_type = 'importacao-fatura' and f.source_id = v.chave);

-- parcelas 46 a 90 de 169
insert into public.financial_transactions (owner_id, unit_id, type, status, description, amount, due_date, purchase_date, card_invoice_id, credit_card_id, purchase_group_id, installment_number, installment_total, category_id, supplier_name, account_id, payment_method, source_type, source_id)
select 'a206246b-a797-48af-93f7-7dc6db3a266d', c.unit_id, 'payable', 'pending', v.descricao, v.valor,
       i.due_date, v.comprada_em, i.id, c.id, v.grupo,
       case when v.parcelas > 1 then v.parcela end,
       case when v.parcelas > 1 then v.parcelas end,
       (select id from public.financial_categories where owner_id = 'a206246b-a797-48af-93f7-7dc6db3a266d' and name = v.categoria limit 1),
       v.fornecedor, c.account_id, 'credito', 'importacao-fatura', v.chave
  from (values
    ('Limpeza, suportes e manutenção da sala (2/4)', 11.23, '2026-08-20'::date, 2, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-20|4|0|2', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '53285506-f469-53ed-974f-d00274ef4bf8'::uuid, '2026-10-11'::date),
    ('Limpeza, suportes e manutenção da sala (2/4)', 104.75, '2026-08-20'::date, 2, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-20|4|1|2', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'c1ff3b7c-580b-51e7-8dff-45729e747492'::uuid, '2026-10-11'::date),
    ('Limpeza, suportes e manutenção da sala (2/8)', 10.88, '2026-08-28'::date, 2, 8, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-28|8|0|2', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'aee4f1be-0a02-5734-99a0-2b335e3d2de6'::uuid, '2026-10-11'::date),
    ('Luminária da sala (2/8)', 21.51, '2026-09-10'::date, 2, 8, 'Material de Construção', 'Âncora (Mercado Livre)', 'Mercado Pago|MERCADOLIVRE ANCORA|2026-09-10|8|0|2', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '090cb72a-cdd3-51b0-baed-f85ebbe97769'::uuid, '2026-10-11'::date),
    ('Acabamento da sala (2/3)', 63.25, '2026-08-20'::date, 2, 3, 'Material de Construção', 'AçoDecor (Shopee)', 'Inter|SHOPEE ACODECOR|2026-08-20|3|0|2', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'f2b009b8-dd24-5885-b58f-fafdcaa8877b'::uuid, '2026-10-13'::date),
    ('Bancada da sala (2/5)', 980.00, '2026-08-18'::date, 2, 5, 'Material de Construção', 'Marmoraria Passos', 'Inter|MARMORARIA PASSOS|2026-08-18|5|0|2', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '70ae85f8-4f3f-570f-9173-fb253e5d0a1a'::uuid, '2026-10-13'::date),
    ('Equipamento da sala (2/12)', 71.49, '2026-08-28'::date, 2, 12, 'Equipamentos', 'Webcontinental (Shopee)', 'Inter|SHOPEE WEBCONTINENTAL|2026-08-28|12|0|2', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'b14c9e36-a4d6-5b61-9d2d-fac1cf19d194'::uuid, '2026-10-13'::date),
    ('Espelhos da sala (2/10)', 72.00, '2026-08-27'::date, 2, 10, 'Móveis', 'Outlet dos Espelhos (Shopee)', 'Inter|SHOPEE OUTLETDOSESPEL|2026-08-27|10|0|2', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '57b02d6b-dc04-59ac-9661-5db8de79f0c2'::uuid, '2026-10-13'::date),
    ('Iluminação da sala (2/4)', 106.04, '2026-08-20'::date, 2, 4, 'Material de Construção', 'Divina Luz (Shopee)', 'Inter|SHOPEE DIVINALUZOFICI|2026-08-20|4|0|2', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'c1414128-fd1f-5af6-8d24-fc327ea70152'::uuid, '2026-10-13'::date),
    ('Itens operacionais da sala (2/4)', 40.51, '2026-09-05'::date, 2, 4, 'Material de Consumo', 'Shopee', 'Inter|SHOPEE 50487836 AUGUST|2026-09-05|4|0|2', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '8376877e-8589-5293-bcad-aca486503890'::uuid, '2026-10-13'::date),
    ('Limpeza, suportes e manutenção da sala (2/3)', 82.05, '2026-08-20'::date, 2, 3, 'Material de Consumo', 'Mercado Livre', 'Inter|MERCADOLIVRE MERCADOL|2026-08-20|3|0|2', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '88fee847-3a04-502f-8b1a-521057f2b38e'::uuid, '2026-10-13'::date),
    ('Móveis da sala (2/7)', 162.90, '2026-08-24'::date, 2, 7, 'Móveis', 'MadeiraMadeira', 'Inter|MADEIRAMAD TUCASHOP|2026-08-24|7|0|2', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '06652329-f581-56c4-804c-9f39add6594e'::uuid, '2026-10-13'::date),
    ('Móveis planejados da sala (2/4)', 537.82, '2026-08-25'::date, 2, 4, 'Móveis', 'Qualitate', 'Inter|MP QUALITATE|2026-08-25|4|0|2', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'c94717fe-eb22-5e8e-a789-0a40e3f11bd3'::uuid, '2026-10-13'::date),
    ('Tintas da sala (3/10)', 362.89, '2026-08-07'::date, 3, 10, 'Material de Construção', 'IR Comércio de Tintas', 'Inter|IR COMERCIO DE TINTAS|2026-08-07|10|0|3', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'be7397ae-3181-5378-a1ca-c9719ba6ac3d'::uuid, '2026-10-13'::date),
    ('Torneiras da sala (2/5)', 86.75, '2026-08-23'::date, 2, 5, 'Material de Construção', 'DastyShop (Shopee)', 'Inter|SHOPEE DASTYSHOP|2026-08-23|5|0|2', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'a1164ba7-91b1-5642-a8b3-5f7826e06715'::uuid, '2026-10-13'::date),
    ('Cadeiras da sala (3/12)', 60.82, '2026-09-05'::date, 3, 12, 'Móveis', 'DunaMobi', 'Mercado Pago|MP DUNAMOBI0012609322629|2026-09-05|12|0|3', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bd1dce84-9ec9-5b07-8723-52960c6d38ed'::uuid, '2026-11-11'::date),
    ('Frigobar da sala (3/8)', 60.60, '2026-09-04'::date, 3, 8, 'Equipamentos', 'Electrolux (Shopee)', 'Mercado Pago|SHOPEE ELECTROLUX|2026-09-04|8|0|3', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'dc4654d4-6832-5e02-939c-d6f8e731f114'::uuid, '2026-11-11'::date),
    ('Limpeza, suportes e manutenção da sala (3/10)', 45.07, '2026-09-05'::date, 3, 10, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|10|0|3', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '323ffd10-199e-55e5-97f8-62fd4c780504'::uuid, '2026-11-11'::date),
    ('Limpeza, suportes e manutenção da sala (3/12)', 95.89, '2026-08-27'::date, 3, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-27|12|0|3', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '751478ea-9c7b-597e-bb39-7ec05df9c712'::uuid, '2026-11-11'::date),
    ('Limpeza, suportes e manutenção da sala (3/12)', 75.37, '2026-08-31'::date, 3, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-31|12|0|3', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '4cd00499-176b-5062-8c39-3f56e4bcf968'::uuid, '2026-11-11'::date),
    ('Limpeza, suportes e manutenção da sala (3/3)', 33.56, '2026-09-10'::date, 3, 3, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-10|3|0|3', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '94473c57-03e0-560d-9a3f-77de9b003b07'::uuid, '2026-11-11'::date),
    ('Limpeza, suportes e manutenção da sala (3/4)', 15.02, '2026-09-05'::date, 3, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|4|0|3', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bf4a3a33-0843-5d4c-8519-66d6410e03d9'::uuid, '2026-11-11'::date),
    ('Limpeza, suportes e manutenção da sala (3/4)', 15.02, '2026-09-08'::date, 3, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-08|4|0|3', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '55cc35a0-f0d0-55d2-9f35-5dfb79993d0c'::uuid, '2026-11-11'::date),
    ('Limpeza, suportes e manutenção da sala (3/4)', 11.23, '2026-08-20'::date, 3, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-20|4|0|3', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '53285506-f469-53ed-974f-d00274ef4bf8'::uuid, '2026-11-11'::date),
    ('Limpeza, suportes e manutenção da sala (3/4)', 104.75, '2026-08-20'::date, 3, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-20|4|1|3', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'c1ff3b7c-580b-51e7-8dff-45729e747492'::uuid, '2026-11-11'::date),
    ('Limpeza, suportes e manutenção da sala (3/8)', 10.88, '2026-08-28'::date, 3, 8, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-28|8|0|3', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'aee4f1be-0a02-5734-99a0-2b335e3d2de6'::uuid, '2026-11-11'::date),
    ('Luminária da sala (3/8)', 21.51, '2026-09-10'::date, 3, 8, 'Material de Construção', 'Âncora (Mercado Livre)', 'Mercado Pago|MERCADOLIVRE ANCORA|2026-09-10|8|0|3', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '090cb72a-cdd3-51b0-baed-f85ebbe97769'::uuid, '2026-11-11'::date),
    ('Acabamento da sala (3/3)', 63.25, '2026-08-20'::date, 3, 3, 'Material de Construção', 'AçoDecor (Shopee)', 'Inter|SHOPEE ACODECOR|2026-08-20|3|0|3', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'f2b009b8-dd24-5885-b58f-fafdcaa8877b'::uuid, '2026-11-13'::date),
    ('Bancada da sala (3/5)', 980.00, '2026-08-18'::date, 3, 5, 'Material de Construção', 'Marmoraria Passos', 'Inter|MARMORARIA PASSOS|2026-08-18|5|0|3', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '70ae85f8-4f3f-570f-9173-fb253e5d0a1a'::uuid, '2026-11-13'::date),
    ('Equipamento da sala (3/12)', 71.49, '2026-08-28'::date, 3, 12, 'Equipamentos', 'Webcontinental (Shopee)', 'Inter|SHOPEE WEBCONTINENTAL|2026-08-28|12|0|3', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'b14c9e36-a4d6-5b61-9d2d-fac1cf19d194'::uuid, '2026-11-13'::date),
    ('Espelhos da sala (3/10)', 72.00, '2026-08-27'::date, 3, 10, 'Móveis', 'Outlet dos Espelhos (Shopee)', 'Inter|SHOPEE OUTLETDOSESPEL|2026-08-27|10|0|3', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '57b02d6b-dc04-59ac-9661-5db8de79f0c2'::uuid, '2026-11-13'::date),
    ('Iluminação da sala (3/4)', 106.04, '2026-08-20'::date, 3, 4, 'Material de Construção', 'Divina Luz (Shopee)', 'Inter|SHOPEE DIVINALUZOFICI|2026-08-20|4|0|3', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'c1414128-fd1f-5af6-8d24-fc327ea70152'::uuid, '2026-11-13'::date),
    ('Itens operacionais da sala (3/4)', 40.51, '2026-09-05'::date, 3, 4, 'Material de Consumo', 'Shopee', 'Inter|SHOPEE 50487836 AUGUST|2026-09-05|4|0|3', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '8376877e-8589-5293-bcad-aca486503890'::uuid, '2026-11-13'::date),
    ('Limpeza, suportes e manutenção da sala (3/3)', 82.05, '2026-08-20'::date, 3, 3, 'Material de Consumo', 'Mercado Livre', 'Inter|MERCADOLIVRE MERCADOL|2026-08-20|3|0|3', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '88fee847-3a04-502f-8b1a-521057f2b38e'::uuid, '2026-11-13'::date),
    ('Móveis da sala (3/7)', 162.90, '2026-08-24'::date, 3, 7, 'Móveis', 'MadeiraMadeira', 'Inter|MADEIRAMAD TUCASHOP|2026-08-24|7|0|3', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '06652329-f581-56c4-804c-9f39add6594e'::uuid, '2026-11-13'::date),
    ('Móveis planejados da sala (3/4)', 537.82, '2026-08-25'::date, 3, 4, 'Móveis', 'Qualitate', 'Inter|MP QUALITATE|2026-08-25|4|0|3', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'c94717fe-eb22-5e8e-a789-0a40e3f11bd3'::uuid, '2026-11-13'::date),
    ('Tintas da sala (4/10)', 362.89, '2026-08-07'::date, 4, 10, 'Material de Construção', 'IR Comércio de Tintas', 'Inter|IR COMERCIO DE TINTAS|2026-08-07|10|0|4', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'be7397ae-3181-5378-a1ca-c9719ba6ac3d'::uuid, '2026-11-13'::date),
    ('Torneiras da sala (3/5)', 86.75, '2026-08-23'::date, 3, 5, 'Material de Construção', 'DastyShop (Shopee)', 'Inter|SHOPEE DASTYSHOP|2026-08-23|5|0|3', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'a1164ba7-91b1-5642-a8b3-5f7826e06715'::uuid, '2026-11-13'::date),
    ('Cadeiras da sala (4/12)', 60.82, '2026-09-05'::date, 4, 12, 'Móveis', 'DunaMobi', 'Mercado Pago|MP DUNAMOBI0012609322629|2026-09-05|12|0|4', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bd1dce84-9ec9-5b07-8723-52960c6d38ed'::uuid, '2026-12-11'::date),
    ('Frigobar da sala (4/8)', 60.60, '2026-09-04'::date, 4, 8, 'Equipamentos', 'Electrolux (Shopee)', 'Mercado Pago|SHOPEE ELECTROLUX|2026-09-04|8|0|4', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'dc4654d4-6832-5e02-939c-d6f8e731f114'::uuid, '2026-12-11'::date),
    ('Limpeza, suportes e manutenção da sala (4/10)', 45.07, '2026-09-05'::date, 4, 10, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|10|0|4', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '323ffd10-199e-55e5-97f8-62fd4c780504'::uuid, '2026-12-11'::date),
    ('Limpeza, suportes e manutenção da sala (4/12)', 95.89, '2026-08-27'::date, 4, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-27|12|0|4', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '751478ea-9c7b-597e-bb39-7ec05df9c712'::uuid, '2026-12-11'::date),
    ('Limpeza, suportes e manutenção da sala (4/12)', 75.37, '2026-08-31'::date, 4, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-31|12|0|4', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '4cd00499-176b-5062-8c39-3f56e4bcf968'::uuid, '2026-12-11'::date),
    ('Limpeza, suportes e manutenção da sala (4/4)', 15.02, '2026-09-05'::date, 4, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|4|0|4', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bf4a3a33-0843-5d4c-8519-66d6410e03d9'::uuid, '2026-12-11'::date),
    ('Limpeza, suportes e manutenção da sala (4/4)', 15.02, '2026-09-08'::date, 4, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-08|4|0|4', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '55cc35a0-f0d0-55d2-9f35-5dfb79993d0c'::uuid, '2026-12-11'::date)
       ) as v(descricao, valor, comprada_em, parcela, parcelas, categoria, fornecedor, chave, cartao, grupo, fechamento)
  join public.credit_cards c on c.id = v.cartao
  join public.card_invoices i on i.card_id = v.cartao and i.closing_date = v.fechamento
 where not exists (select 1 from public.financial_transactions f where f.source_type = 'importacao-fatura' and f.source_id = v.chave);

-- parcelas 91 a 135 de 169
insert into public.financial_transactions (owner_id, unit_id, type, status, description, amount, due_date, purchase_date, card_invoice_id, credit_card_id, purchase_group_id, installment_number, installment_total, category_id, supplier_name, account_id, payment_method, source_type, source_id)
select 'a206246b-a797-48af-93f7-7dc6db3a266d', c.unit_id, 'payable', 'pending', v.descricao, v.valor,
       i.due_date, v.comprada_em, i.id, c.id, v.grupo,
       case when v.parcelas > 1 then v.parcela end,
       case when v.parcelas > 1 then v.parcelas end,
       (select id from public.financial_categories where owner_id = 'a206246b-a797-48af-93f7-7dc6db3a266d' and name = v.categoria limit 1),
       v.fornecedor, c.account_id, 'credito', 'importacao-fatura', v.chave
  from (values
    ('Limpeza, suportes e manutenção da sala (4/4)', 11.23, '2026-08-20'::date, 4, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-20|4|0|4', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '53285506-f469-53ed-974f-d00274ef4bf8'::uuid, '2026-12-11'::date),
    ('Limpeza, suportes e manutenção da sala (4/4)', 104.75, '2026-08-20'::date, 4, 4, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-20|4|1|4', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'c1ff3b7c-580b-51e7-8dff-45729e747492'::uuid, '2026-12-11'::date),
    ('Limpeza, suportes e manutenção da sala (4/8)', 10.88, '2026-08-28'::date, 4, 8, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-28|8|0|4', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'aee4f1be-0a02-5734-99a0-2b335e3d2de6'::uuid, '2026-12-11'::date),
    ('Luminária da sala (4/8)', 21.51, '2026-09-10'::date, 4, 8, 'Material de Construção', 'Âncora (Mercado Livre)', 'Mercado Pago|MERCADOLIVRE ANCORA|2026-09-10|8|0|4', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '090cb72a-cdd3-51b0-baed-f85ebbe97769'::uuid, '2026-12-11'::date),
    ('Bancada da sala (4/5)', 980.00, '2026-08-18'::date, 4, 5, 'Material de Construção', 'Marmoraria Passos', 'Inter|MARMORARIA PASSOS|2026-08-18|5|0|4', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '70ae85f8-4f3f-570f-9173-fb253e5d0a1a'::uuid, '2026-12-13'::date),
    ('Equipamento da sala (4/12)', 71.49, '2026-08-28'::date, 4, 12, 'Equipamentos', 'Webcontinental (Shopee)', 'Inter|SHOPEE WEBCONTINENTAL|2026-08-28|12|0|4', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'b14c9e36-a4d6-5b61-9d2d-fac1cf19d194'::uuid, '2026-12-13'::date),
    ('Espelhos da sala (4/10)', 72.00, '2026-08-27'::date, 4, 10, 'Móveis', 'Outlet dos Espelhos (Shopee)', 'Inter|SHOPEE OUTLETDOSESPEL|2026-08-27|10|0|4', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '57b02d6b-dc04-59ac-9661-5db8de79f0c2'::uuid, '2026-12-13'::date),
    ('Iluminação da sala (4/4)', 106.04, '2026-08-20'::date, 4, 4, 'Material de Construção', 'Divina Luz (Shopee)', 'Inter|SHOPEE DIVINALUZOFICI|2026-08-20|4|0|4', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'c1414128-fd1f-5af6-8d24-fc327ea70152'::uuid, '2026-12-13'::date),
    ('Itens operacionais da sala (4/4)', 40.51, '2026-09-05'::date, 4, 4, 'Material de Consumo', 'Shopee', 'Inter|SHOPEE 50487836 AUGUST|2026-09-05|4|0|4', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '8376877e-8589-5293-bcad-aca486503890'::uuid, '2026-12-13'::date),
    ('Móveis da sala (4/7)', 162.90, '2026-08-24'::date, 4, 7, 'Móveis', 'MadeiraMadeira', 'Inter|MADEIRAMAD TUCASHOP|2026-08-24|7|0|4', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '06652329-f581-56c4-804c-9f39add6594e'::uuid, '2026-12-13'::date),
    ('Móveis planejados da sala (4/4)', 537.82, '2026-08-25'::date, 4, 4, 'Móveis', 'Qualitate', 'Inter|MP QUALITATE|2026-08-25|4|0|4', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'c94717fe-eb22-5e8e-a789-0a40e3f11bd3'::uuid, '2026-12-13'::date),
    ('Tintas da sala (5/10)', 362.89, '2026-08-07'::date, 5, 10, 'Material de Construção', 'IR Comércio de Tintas', 'Inter|IR COMERCIO DE TINTAS|2026-08-07|10|0|5', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'be7397ae-3181-5378-a1ca-c9719ba6ac3d'::uuid, '2026-12-13'::date),
    ('Torneiras da sala (4/5)', 86.75, '2026-08-23'::date, 4, 5, 'Material de Construção', 'DastyShop (Shopee)', 'Inter|SHOPEE DASTYSHOP|2026-08-23|5|0|4', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'a1164ba7-91b1-5642-a8b3-5f7826e06715'::uuid, '2026-12-13'::date),
    ('Cadeiras da sala (5/12)', 60.82, '2026-09-05'::date, 5, 12, 'Móveis', 'DunaMobi', 'Mercado Pago|MP DUNAMOBI0012609322629|2026-09-05|12|0|5', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bd1dce84-9ec9-5b07-8723-52960c6d38ed'::uuid, '2027-01-11'::date),
    ('Frigobar da sala (5/8)', 60.60, '2026-09-04'::date, 5, 8, 'Equipamentos', 'Electrolux (Shopee)', 'Mercado Pago|SHOPEE ELECTROLUX|2026-09-04|8|0|5', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'dc4654d4-6832-5e02-939c-d6f8e731f114'::uuid, '2027-01-11'::date),
    ('Limpeza, suportes e manutenção da sala (5/10)', 45.07, '2026-09-05'::date, 5, 10, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|10|0|5', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '323ffd10-199e-55e5-97f8-62fd4c780504'::uuid, '2027-01-11'::date),
    ('Limpeza, suportes e manutenção da sala (5/12)', 95.89, '2026-08-27'::date, 5, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-27|12|0|5', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '751478ea-9c7b-597e-bb39-7ec05df9c712'::uuid, '2027-01-11'::date),
    ('Limpeza, suportes e manutenção da sala (5/12)', 75.37, '2026-08-31'::date, 5, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-31|12|0|5', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '4cd00499-176b-5062-8c39-3f56e4bcf968'::uuid, '2027-01-11'::date),
    ('Limpeza, suportes e manutenção da sala (5/8)', 10.88, '2026-08-28'::date, 5, 8, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-28|8|0|5', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'aee4f1be-0a02-5734-99a0-2b335e3d2de6'::uuid, '2027-01-11'::date),
    ('Luminária da sala (5/8)', 21.51, '2026-09-10'::date, 5, 8, 'Material de Construção', 'Âncora (Mercado Livre)', 'Mercado Pago|MERCADOLIVRE ANCORA|2026-09-10|8|0|5', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '090cb72a-cdd3-51b0-baed-f85ebbe97769'::uuid, '2027-01-11'::date),
    ('Bancada da sala (5/5)', 980.00, '2026-08-18'::date, 5, 5, 'Material de Construção', 'Marmoraria Passos', 'Inter|MARMORARIA PASSOS|2026-08-18|5|0|5', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '70ae85f8-4f3f-570f-9173-fb253e5d0a1a'::uuid, '2027-01-13'::date),
    ('Equipamento da sala (5/12)', 71.49, '2026-08-28'::date, 5, 12, 'Equipamentos', 'Webcontinental (Shopee)', 'Inter|SHOPEE WEBCONTINENTAL|2026-08-28|12|0|5', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'b14c9e36-a4d6-5b61-9d2d-fac1cf19d194'::uuid, '2027-01-13'::date),
    ('Espelhos da sala (5/10)', 72.00, '2026-08-27'::date, 5, 10, 'Móveis', 'Outlet dos Espelhos (Shopee)', 'Inter|SHOPEE OUTLETDOSESPEL|2026-08-27|10|0|5', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '57b02d6b-dc04-59ac-9661-5db8de79f0c2'::uuid, '2027-01-13'::date),
    ('Móveis da sala (5/7)', 162.90, '2026-08-24'::date, 5, 7, 'Móveis', 'MadeiraMadeira', 'Inter|MADEIRAMAD TUCASHOP|2026-08-24|7|0|5', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '06652329-f581-56c4-804c-9f39add6594e'::uuid, '2027-01-13'::date),
    ('Tintas da sala (6/10)', 362.89, '2026-08-07'::date, 6, 10, 'Material de Construção', 'IR Comércio de Tintas', 'Inter|IR COMERCIO DE TINTAS|2026-08-07|10|0|6', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'be7397ae-3181-5378-a1ca-c9719ba6ac3d'::uuid, '2027-01-13'::date),
    ('Torneiras da sala (5/5)', 86.75, '2026-08-23'::date, 5, 5, 'Material de Construção', 'DastyShop (Shopee)', 'Inter|SHOPEE DASTYSHOP|2026-08-23|5|0|5', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'a1164ba7-91b1-5642-a8b3-5f7826e06715'::uuid, '2027-01-13'::date),
    ('Cadeiras da sala (6/12)', 60.82, '2026-09-05'::date, 6, 12, 'Móveis', 'DunaMobi', 'Mercado Pago|MP DUNAMOBI0012609322629|2026-09-05|12|0|6', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bd1dce84-9ec9-5b07-8723-52960c6d38ed'::uuid, '2027-02-11'::date),
    ('Frigobar da sala (6/8)', 60.60, '2026-09-04'::date, 6, 8, 'Equipamentos', 'Electrolux (Shopee)', 'Mercado Pago|SHOPEE ELECTROLUX|2026-09-04|8|0|6', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'dc4654d4-6832-5e02-939c-d6f8e731f114'::uuid, '2027-02-11'::date),
    ('Limpeza, suportes e manutenção da sala (6/10)', 45.07, '2026-09-05'::date, 6, 10, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|10|0|6', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '323ffd10-199e-55e5-97f8-62fd4c780504'::uuid, '2027-02-11'::date),
    ('Limpeza, suportes e manutenção da sala (6/12)', 95.89, '2026-08-27'::date, 6, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-27|12|0|6', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '751478ea-9c7b-597e-bb39-7ec05df9c712'::uuid, '2027-02-11'::date),
    ('Limpeza, suportes e manutenção da sala (6/12)', 75.37, '2026-08-31'::date, 6, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-31|12|0|6', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '4cd00499-176b-5062-8c39-3f56e4bcf968'::uuid, '2027-02-11'::date),
    ('Limpeza, suportes e manutenção da sala (6/8)', 10.88, '2026-08-28'::date, 6, 8, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-28|8|0|6', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'aee4f1be-0a02-5734-99a0-2b335e3d2de6'::uuid, '2027-02-11'::date),
    ('Luminária da sala (6/8)', 21.51, '2026-09-10'::date, 6, 8, 'Material de Construção', 'Âncora (Mercado Livre)', 'Mercado Pago|MERCADOLIVRE ANCORA|2026-09-10|8|0|6', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '090cb72a-cdd3-51b0-baed-f85ebbe97769'::uuid, '2027-02-11'::date),
    ('Equipamento da sala (6/12)', 71.49, '2026-08-28'::date, 6, 12, 'Equipamentos', 'Webcontinental (Shopee)', 'Inter|SHOPEE WEBCONTINENTAL|2026-08-28|12|0|6', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'b14c9e36-a4d6-5b61-9d2d-fac1cf19d194'::uuid, '2027-02-13'::date),
    ('Espelhos da sala (6/10)', 72.00, '2026-08-27'::date, 6, 10, 'Móveis', 'Outlet dos Espelhos (Shopee)', 'Inter|SHOPEE OUTLETDOSESPEL|2026-08-27|10|0|6', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '57b02d6b-dc04-59ac-9661-5db8de79f0c2'::uuid, '2027-02-13'::date),
    ('Móveis da sala (6/7)', 162.90, '2026-08-24'::date, 6, 7, 'Móveis', 'MadeiraMadeira', 'Inter|MADEIRAMAD TUCASHOP|2026-08-24|7|0|6', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '06652329-f581-56c4-804c-9f39add6594e'::uuid, '2027-02-13'::date),
    ('Tintas da sala (7/10)', 362.89, '2026-08-07'::date, 7, 10, 'Material de Construção', 'IR Comércio de Tintas', 'Inter|IR COMERCIO DE TINTAS|2026-08-07|10|0|7', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'be7397ae-3181-5378-a1ca-c9719ba6ac3d'::uuid, '2027-02-13'::date),
    ('Cadeiras da sala (7/12)', 60.82, '2026-09-05'::date, 7, 12, 'Móveis', 'DunaMobi', 'Mercado Pago|MP DUNAMOBI0012609322629|2026-09-05|12|0|7', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bd1dce84-9ec9-5b07-8723-52960c6d38ed'::uuid, '2027-03-11'::date),
    ('Frigobar da sala (7/8)', 60.60, '2026-09-04'::date, 7, 8, 'Equipamentos', 'Electrolux (Shopee)', 'Mercado Pago|SHOPEE ELECTROLUX|2026-09-04|8|0|7', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'dc4654d4-6832-5e02-939c-d6f8e731f114'::uuid, '2027-03-11'::date),
    ('Limpeza, suportes e manutenção da sala (7/10)', 45.07, '2026-09-05'::date, 7, 10, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|10|0|7', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '323ffd10-199e-55e5-97f8-62fd4c780504'::uuid, '2027-03-11'::date),
    ('Limpeza, suportes e manutenção da sala (7/12)', 95.89, '2026-08-27'::date, 7, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-27|12|0|7', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '751478ea-9c7b-597e-bb39-7ec05df9c712'::uuid, '2027-03-11'::date),
    ('Limpeza, suportes e manutenção da sala (7/12)', 75.37, '2026-08-31'::date, 7, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-31|12|0|7', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '4cd00499-176b-5062-8c39-3f56e4bcf968'::uuid, '2027-03-11'::date),
    ('Limpeza, suportes e manutenção da sala (7/8)', 10.88, '2026-08-28'::date, 7, 8, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-28|8|0|7', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'aee4f1be-0a02-5734-99a0-2b335e3d2de6'::uuid, '2027-03-11'::date),
    ('Luminária da sala (7/8)', 21.51, '2026-09-10'::date, 7, 8, 'Material de Construção', 'Âncora (Mercado Livre)', 'Mercado Pago|MERCADOLIVRE ANCORA|2026-09-10|8|0|7', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '090cb72a-cdd3-51b0-baed-f85ebbe97769'::uuid, '2027-03-11'::date),
    ('Equipamento da sala (7/12)', 71.49, '2026-08-28'::date, 7, 12, 'Equipamentos', 'Webcontinental (Shopee)', 'Inter|SHOPEE WEBCONTINENTAL|2026-08-28|12|0|7', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'b14c9e36-a4d6-5b61-9d2d-fac1cf19d194'::uuid, '2027-03-13'::date)
       ) as v(descricao, valor, comprada_em, parcela, parcelas, categoria, fornecedor, chave, cartao, grupo, fechamento)
  join public.credit_cards c on c.id = v.cartao
  join public.card_invoices i on i.card_id = v.cartao and i.closing_date = v.fechamento
 where not exists (select 1 from public.financial_transactions f where f.source_type = 'importacao-fatura' and f.source_id = v.chave);

-- parcelas 136 a 169 de 169
insert into public.financial_transactions (owner_id, unit_id, type, status, description, amount, due_date, purchase_date, card_invoice_id, credit_card_id, purchase_group_id, installment_number, installment_total, category_id, supplier_name, account_id, payment_method, source_type, source_id)
select 'a206246b-a797-48af-93f7-7dc6db3a266d', c.unit_id, 'payable', 'pending', v.descricao, v.valor,
       i.due_date, v.comprada_em, i.id, c.id, v.grupo,
       case when v.parcelas > 1 then v.parcela end,
       case when v.parcelas > 1 then v.parcelas end,
       (select id from public.financial_categories where owner_id = 'a206246b-a797-48af-93f7-7dc6db3a266d' and name = v.categoria limit 1),
       v.fornecedor, c.account_id, 'credito', 'importacao-fatura', v.chave
  from (values
    ('Espelhos da sala (7/10)', 72.00, '2026-08-27'::date, 7, 10, 'Móveis', 'Outlet dos Espelhos (Shopee)', 'Inter|SHOPEE OUTLETDOSESPEL|2026-08-27|10|0|7', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '57b02d6b-dc04-59ac-9661-5db8de79f0c2'::uuid, '2027-03-13'::date),
    ('Móveis da sala (7/7)', 162.90, '2026-08-24'::date, 7, 7, 'Móveis', 'MadeiraMadeira', 'Inter|MADEIRAMAD TUCASHOP|2026-08-24|7|0|7', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '06652329-f581-56c4-804c-9f39add6594e'::uuid, '2027-03-13'::date),
    ('Tintas da sala (8/10)', 362.89, '2026-08-07'::date, 8, 10, 'Material de Construção', 'IR Comércio de Tintas', 'Inter|IR COMERCIO DE TINTAS|2026-08-07|10|0|8', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'be7397ae-3181-5378-a1ca-c9719ba6ac3d'::uuid, '2027-03-13'::date),
    ('Cadeiras da sala (8/12)', 60.82, '2026-09-05'::date, 8, 12, 'Móveis', 'DunaMobi', 'Mercado Pago|MP DUNAMOBI0012609322629|2026-09-05|12|0|8', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bd1dce84-9ec9-5b07-8723-52960c6d38ed'::uuid, '2027-04-11'::date),
    ('Frigobar da sala (8/8)', 60.60, '2026-09-04'::date, 8, 8, 'Equipamentos', 'Electrolux (Shopee)', 'Mercado Pago|SHOPEE ELECTROLUX|2026-09-04|8|0|8', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'dc4654d4-6832-5e02-939c-d6f8e731f114'::uuid, '2027-04-11'::date),
    ('Limpeza, suportes e manutenção da sala (8/10)', 45.07, '2026-09-05'::date, 8, 10, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|10|0|8', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '323ffd10-199e-55e5-97f8-62fd4c780504'::uuid, '2027-04-11'::date),
    ('Limpeza, suportes e manutenção da sala (8/12)', 95.89, '2026-08-27'::date, 8, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-27|12|0|8', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '751478ea-9c7b-597e-bb39-7ec05df9c712'::uuid, '2027-04-11'::date),
    ('Limpeza, suportes e manutenção da sala (8/12)', 75.37, '2026-08-31'::date, 8, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-31|12|0|8', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '4cd00499-176b-5062-8c39-3f56e4bcf968'::uuid, '2027-04-11'::date),
    ('Limpeza, suportes e manutenção da sala (8/8)', 10.88, '2026-08-28'::date, 8, 8, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-28|8|0|8', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'aee4f1be-0a02-5734-99a0-2b335e3d2de6'::uuid, '2027-04-11'::date),
    ('Luminária da sala (8/8)', 21.51, '2026-09-10'::date, 8, 8, 'Material de Construção', 'Âncora (Mercado Livre)', 'Mercado Pago|MERCADOLIVRE ANCORA|2026-09-10|8|0|8', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '090cb72a-cdd3-51b0-baed-f85ebbe97769'::uuid, '2027-04-11'::date),
    ('Equipamento da sala (8/12)', 71.49, '2026-08-28'::date, 8, 12, 'Equipamentos', 'Webcontinental (Shopee)', 'Inter|SHOPEE WEBCONTINENTAL|2026-08-28|12|0|8', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'b14c9e36-a4d6-5b61-9d2d-fac1cf19d194'::uuid, '2027-04-13'::date),
    ('Espelhos da sala (8/10)', 72.00, '2026-08-27'::date, 8, 10, 'Móveis', 'Outlet dos Espelhos (Shopee)', 'Inter|SHOPEE OUTLETDOSESPEL|2026-08-27|10|0|8', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '57b02d6b-dc04-59ac-9661-5db8de79f0c2'::uuid, '2027-04-13'::date),
    ('Tintas da sala (9/10)', 362.89, '2026-08-07'::date, 9, 10, 'Material de Construção', 'IR Comércio de Tintas', 'Inter|IR COMERCIO DE TINTAS|2026-08-07|10|0|9', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'be7397ae-3181-5378-a1ca-c9719ba6ac3d'::uuid, '2027-04-13'::date),
    ('Cadeiras da sala (9/12)', 60.82, '2026-09-05'::date, 9, 12, 'Móveis', 'DunaMobi', 'Mercado Pago|MP DUNAMOBI0012609322629|2026-09-05|12|0|9', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bd1dce84-9ec9-5b07-8723-52960c6d38ed'::uuid, '2027-05-11'::date),
    ('Limpeza, suportes e manutenção da sala (9/10)', 45.07, '2026-09-05'::date, 9, 10, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|10|0|9', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '323ffd10-199e-55e5-97f8-62fd4c780504'::uuid, '2027-05-11'::date),
    ('Limpeza, suportes e manutenção da sala (9/12)', 95.89, '2026-08-27'::date, 9, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-27|12|0|9', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '751478ea-9c7b-597e-bb39-7ec05df9c712'::uuid, '2027-05-11'::date),
    ('Limpeza, suportes e manutenção da sala (9/12)', 75.37, '2026-08-31'::date, 9, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-31|12|0|9', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '4cd00499-176b-5062-8c39-3f56e4bcf968'::uuid, '2027-05-11'::date),
    ('Equipamento da sala (9/12)', 71.49, '2026-08-28'::date, 9, 12, 'Equipamentos', 'Webcontinental (Shopee)', 'Inter|SHOPEE WEBCONTINENTAL|2026-08-28|12|0|9', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'b14c9e36-a4d6-5b61-9d2d-fac1cf19d194'::uuid, '2027-05-13'::date),
    ('Espelhos da sala (9/10)', 72.00, '2026-08-27'::date, 9, 10, 'Móveis', 'Outlet dos Espelhos (Shopee)', 'Inter|SHOPEE OUTLETDOSESPEL|2026-08-27|10|0|9', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '57b02d6b-dc04-59ac-9661-5db8de79f0c2'::uuid, '2027-05-13'::date),
    ('Tintas da sala (10/10)', 362.89, '2026-08-07'::date, 10, 10, 'Material de Construção', 'IR Comércio de Tintas', 'Inter|IR COMERCIO DE TINTAS|2026-08-07|10|0|10', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'be7397ae-3181-5378-a1ca-c9719ba6ac3d'::uuid, '2027-05-13'::date),
    ('Cadeiras da sala (10/12)', 60.82, '2026-09-05'::date, 10, 12, 'Móveis', 'DunaMobi', 'Mercado Pago|MP DUNAMOBI0012609322629|2026-09-05|12|0|10', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bd1dce84-9ec9-5b07-8723-52960c6d38ed'::uuid, '2027-06-11'::date),
    ('Limpeza, suportes e manutenção da sala (10/10)', 45.07, '2026-09-05'::date, 10, 10, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-09-05|10|0|10', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '323ffd10-199e-55e5-97f8-62fd4c780504'::uuid, '2027-06-11'::date),
    ('Limpeza, suportes e manutenção da sala (10/12)', 95.89, '2026-08-27'::date, 10, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-27|12|0|10', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '751478ea-9c7b-597e-bb39-7ec05df9c712'::uuid, '2027-06-11'::date),
    ('Limpeza, suportes e manutenção da sala (10/12)', 75.37, '2026-08-31'::date, 10, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-31|12|0|10', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '4cd00499-176b-5062-8c39-3f56e4bcf968'::uuid, '2027-06-11'::date),
    ('Equipamento da sala (10/12)', 71.49, '2026-08-28'::date, 10, 12, 'Equipamentos', 'Webcontinental (Shopee)', 'Inter|SHOPEE WEBCONTINENTAL|2026-08-28|12|0|10', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'b14c9e36-a4d6-5b61-9d2d-fac1cf19d194'::uuid, '2027-06-13'::date),
    ('Espelhos da sala (10/10)', 72.00, '2026-08-27'::date, 10, 10, 'Móveis', 'Outlet dos Espelhos (Shopee)', 'Inter|SHOPEE OUTLETDOSESPEL|2026-08-27|10|0|10', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, '57b02d6b-dc04-59ac-9661-5db8de79f0c2'::uuid, '2027-06-13'::date),
    ('Cadeiras da sala (11/12)', 60.82, '2026-09-05'::date, 11, 12, 'Móveis', 'DunaMobi', 'Mercado Pago|MP DUNAMOBI0012609322629|2026-09-05|12|0|11', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bd1dce84-9ec9-5b07-8723-52960c6d38ed'::uuid, '2027-07-11'::date),
    ('Limpeza, suportes e manutenção da sala (11/12)', 95.89, '2026-08-27'::date, 11, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-27|12|0|11', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '751478ea-9c7b-597e-bb39-7ec05df9c712'::uuid, '2027-07-11'::date),
    ('Limpeza, suportes e manutenção da sala (11/12)', 75.37, '2026-08-31'::date, 11, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-31|12|0|11', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '4cd00499-176b-5062-8c39-3f56e4bcf968'::uuid, '2027-07-11'::date),
    ('Equipamento da sala (11/12)', 71.49, '2026-08-28'::date, 11, 12, 'Equipamentos', 'Webcontinental (Shopee)', 'Inter|SHOPEE WEBCONTINENTAL|2026-08-28|12|0|11', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'b14c9e36-a4d6-5b61-9d2d-fac1cf19d194'::uuid, '2027-07-13'::date),
    ('Cadeiras da sala (12/12)', 60.82, '2026-09-05'::date, 12, 12, 'Móveis', 'DunaMobi', 'Mercado Pago|MP DUNAMOBI0012609322629|2026-09-05|12|0|12', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, 'bd1dce84-9ec9-5b07-8723-52960c6d38ed'::uuid, '2027-08-11'::date),
    ('Limpeza, suportes e manutenção da sala (12/12)', 95.89, '2026-08-27'::date, 12, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-27|12|0|12', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '751478ea-9c7b-597e-bb39-7ec05df9c712'::uuid, '2027-08-11'::date),
    ('Limpeza, suportes e manutenção da sala (12/12)', 75.37, '2026-08-31'::date, 12, 12, 'Material de Consumo', 'Mercado Livre', 'Mercado Pago|MERCADOLIVRE MERCADOLIVRE|2026-08-31|12|0|12', 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'::uuid, '4cd00499-176b-5062-8c39-3f56e4bcf968'::uuid, '2027-08-11'::date),
    ('Equipamento da sala (12/12)', 71.49, '2026-08-28'::date, 12, 12, 'Equipamentos', 'Webcontinental (Shopee)', 'Inter|SHOPEE WEBCONTINENTAL|2026-08-28|12|0|12', 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'::uuid, 'b14c9e36-a4d6-5b61-9d2d-fac1cf19d194'::uuid, '2027-08-13'::date)
       ) as v(descricao, valor, comprada_em, parcela, parcelas, categoria, fornecedor, chave, cartao, grupo, fechamento)
  join public.credit_cards c on c.id = v.cartao
  join public.card_invoices i on i.card_id = v.cartao and i.closing_date = v.fechamento
 where not exists (select 1 from public.financial_transactions f where f.source_type = 'importacao-fatura' and f.source_id = v.chave);

-- ── 3b. Os créditos concedidos dentro da fatura ───────────────────────────
--
-- Entra como linha NEGATIVA da fatura, e não como receita: `card_invoice_recalc`
-- soma as compras da fatura, então um valor negativo ali é exatamente o
-- abatimento que o banco deu. Lançar como receita faria a clínica parecer ter
-- faturado isso.
--
-- Sem categoria de propósito: crédito não é gasto de nada.

insert into public.financial_transactions (owner_id, unit_id, type, status, description, amount, due_date, purchase_date, card_invoice_id, credit_card_id, account_id, payment_method, source_type, source_id, notes)
select 'a206246b-a797-48af-93f7-7dc6db3a266d', c.unit_id, 'payable', 'pending', 'Crédito na fatura — Crédito concedido',
       -66.49, i.due_date, '2026-09-08', i.id, c.id, c.account_id,
       'credito', 'importacao-fatura', 'credito|Mercado Pago|2026-09-08|66.49',
       'Abatimento dado pelo banco dentro da fatura. Negativo de propósito: é o que faz o valor da fatura ser o que saiu do caixa.'
  from public.credit_cards c
  join public.card_invoices i on i.card_id = c.id and i.closing_date = '2026-09-11'
 where c.id = 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'
   and not exists (select 1 from public.financial_transactions f where f.source_type = 'importacao-fatura' and f.source_id = 'credito|Mercado Pago|2026-09-08|66.49');

-- ── 4. As parcelas que já estavam lançadas como conta solta ───────────────
--
-- A cadeira do Olsen foi digitada como dez contas a pagar avulsas, com
-- vencimento no dia 29 de cada mês. Ela é uma compra no cartão Inter em 10x, e
-- as parcelas vencem com a FATURA. Em vez de apagar e recriar — o que perderia
-- o histórico das linhas e os ids — elas são anexadas à fatura no lugar.
--
-- A guarda `card_invoice_id is null` serve a duas coisas: torna o UPDATE
-- idempotente e evita acordar o gatilho de congelamento numa segunda passada.

update public.financial_transactions t
   set credit_card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', card_invoice_id = i.id, purchase_date = '2026-04-29',
       purchase_group_id = 'e55b6476-c7bb-5bf9-b82f-bc3d31b2098a', installment_number = 1, installment_total = 10,
       due_date = i.due_date, account_id = 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', payment_method = 'credito',
       source_type = 'importacao-fatura', source_id = 'Inter|ASA OLSEN INDUSTRIA E|2026-04-29|10|0|1', updated_at = now()
  from public.card_invoices i where i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254' and i.closing_date = '2026-05-13'
   and t.id = '04140387-fb40-48c8-8e18-57e48658aab8' and t.card_invoice_id is null;
update public.financial_transactions t
   set credit_card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', card_invoice_id = i.id, purchase_date = '2026-04-29',
       purchase_group_id = 'e55b6476-c7bb-5bf9-b82f-bc3d31b2098a', installment_number = 2, installment_total = 10,
       due_date = i.due_date, account_id = 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', payment_method = 'credito',
       source_type = 'importacao-fatura', source_id = 'Inter|ASA OLSEN INDUSTRIA E|2026-04-29|10|0|2', updated_at = now()
  from public.card_invoices i where i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254' and i.closing_date = '2026-06-13'
   and t.id = '870c4e8e-8afc-46c9-919e-aca232e2e122' and t.card_invoice_id is null;
update public.financial_transactions t
   set credit_card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', card_invoice_id = i.id, purchase_date = '2026-04-29',
       purchase_group_id = 'e55b6476-c7bb-5bf9-b82f-bc3d31b2098a', installment_number = 3, installment_total = 10,
       due_date = i.due_date, account_id = 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', payment_method = 'credito',
       source_type = 'importacao-fatura', source_id = 'Inter|ASA OLSEN INDUSTRIA E|2026-04-29|10|0|3', updated_at = now()
  from public.card_invoices i where i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254' and i.closing_date = '2026-07-13'
   and t.id = '981385e4-5c9b-480d-96b5-a1e55114e2a9' and t.card_invoice_id is null;
update public.financial_transactions t
   set credit_card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', card_invoice_id = i.id, purchase_date = '2026-04-29',
       purchase_group_id = 'e55b6476-c7bb-5bf9-b82f-bc3d31b2098a', installment_number = 4, installment_total = 10,
       due_date = i.due_date, account_id = 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', payment_method = 'credito',
       source_type = 'importacao-fatura', source_id = 'Inter|ASA OLSEN INDUSTRIA E|2026-04-29|10|0|4', updated_at = now()
  from public.card_invoices i where i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254' and i.closing_date = '2026-08-13'
   and t.id = 'a37b3f8f-8b2a-43c2-8e90-f13c0a3c2a7d' and t.card_invoice_id is null;
update public.financial_transactions t
   set credit_card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', card_invoice_id = i.id, purchase_date = '2026-04-29',
       purchase_group_id = 'e55b6476-c7bb-5bf9-b82f-bc3d31b2098a', installment_number = 5, installment_total = 10,
       due_date = i.due_date, account_id = 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', payment_method = 'credito',
       source_type = 'importacao-fatura', source_id = 'Inter|ASA OLSEN INDUSTRIA E|2026-04-29|10|0|5', updated_at = now()
  from public.card_invoices i where i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254' and i.closing_date = '2026-09-13'
   and t.id = '6fd52ec3-bcfb-441d-8e08-b44dfc6e1437' and t.card_invoice_id is null;
update public.financial_transactions t
   set credit_card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', card_invoice_id = i.id, purchase_date = '2026-04-29',
       purchase_group_id = 'e55b6476-c7bb-5bf9-b82f-bc3d31b2098a', installment_number = 6, installment_total = 10,
       due_date = i.due_date, account_id = 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', payment_method = 'credito',
       source_type = 'importacao-fatura', source_id = 'Inter|ASA OLSEN INDUSTRIA E|2026-04-29|10|0|6', updated_at = now()
  from public.card_invoices i where i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254' and i.closing_date = '2026-10-13'
   and t.id = 'f815053a-3ac4-4e4b-907d-c8c317f1e999' and t.card_invoice_id is null;
update public.financial_transactions t
   set credit_card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', card_invoice_id = i.id, purchase_date = '2026-04-29',
       purchase_group_id = 'e55b6476-c7bb-5bf9-b82f-bc3d31b2098a', installment_number = 7, installment_total = 10,
       due_date = i.due_date, account_id = 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', payment_method = 'credito',
       source_type = 'importacao-fatura', source_id = 'Inter|ASA OLSEN INDUSTRIA E|2026-04-29|10|0|7', updated_at = now()
  from public.card_invoices i where i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254' and i.closing_date = '2026-11-13'
   and t.id = 'e34d0970-8587-4320-8474-b92573217267' and t.card_invoice_id is null;
update public.financial_transactions t
   set credit_card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', card_invoice_id = i.id, purchase_date = '2026-04-29',
       purchase_group_id = 'e55b6476-c7bb-5bf9-b82f-bc3d31b2098a', installment_number = 8, installment_total = 10,
       due_date = i.due_date, account_id = 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', payment_method = 'credito',
       source_type = 'importacao-fatura', source_id = 'Inter|ASA OLSEN INDUSTRIA E|2026-04-29|10|0|8', updated_at = now()
  from public.card_invoices i where i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254' and i.closing_date = '2026-12-13'
   and t.id = '1cdd2223-e31f-464f-b25b-3fd710793914' and t.card_invoice_id is null;
update public.financial_transactions t
   set credit_card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', card_invoice_id = i.id, purchase_date = '2026-04-29',
       purchase_group_id = 'e55b6476-c7bb-5bf9-b82f-bc3d31b2098a', installment_number = 9, installment_total = 10,
       due_date = i.due_date, account_id = 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', payment_method = 'credito',
       source_type = 'importacao-fatura', source_id = 'Inter|ASA OLSEN INDUSTRIA E|2026-04-29|10|0|9', updated_at = now()
  from public.card_invoices i where i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254' and i.closing_date = '2027-01-13'
   and t.id = '2849deca-62e8-4ab8-bfc6-40fbd372fc04' and t.card_invoice_id is null;
update public.financial_transactions t
   set credit_card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254', card_invoice_id = i.id, purchase_date = '2026-04-29',
       purchase_group_id = 'e55b6476-c7bb-5bf9-b82f-bc3d31b2098a', installment_number = 10, installment_total = 10,
       due_date = i.due_date, account_id = 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', payment_method = 'credito',
       source_type = 'importacao-fatura', source_id = 'Inter|ASA OLSEN INDUSTRIA E|2026-04-29|10|0|10', updated_at = now()
  from public.card_invoices i where i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254' and i.closing_date = '2027-02-13'
   and t.id = 'c5761c05-6f36-4f91-ba73-8344a07a2ae4' and t.card_invoice_id is null;

-- ── 5. As despesas pagas direto da conta (extrato) ────────────────────────
--
-- Saída de caixa comum: as duas colunas de cartão ficam nulas, e vencimento e
-- pagamento são o mesmo dia — foi pix ou boleto pago na hora.
--
-- `notes` guarda o que o banco escreveu, letra por letra. É o que permite
-- conferir um lançamento contra o extrato meses depois, quando ninguém lembra
-- por que a categoria é aquela.

insert into public.financial_transactions (owner_id, unit_id, type, status, description, amount, due_date, paid_date, category_id, supplier_name, account_id, payment_method, source_type, source_id, notes)
select 'a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'payable', 'paid', v.descricao, v.valor,
       v.pago_em, v.pago_em,
       (select id from public.financial_categories where owner_id = 'a206246b-a797-48af-93f7-7dc6db3a266d' and name = v.categoria limit 1),
       v.fornecedor, 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', v.meio, 'importacao-extrato', v.chave, v.extrato
  from (values
    ('RMS Telecom', 109.90, '2026-03-17'::date, 'Internet e Telefone', 'RMS Telecom', 'pix', 'extrato|2026-03-17|109.90|PIX ENVIADO CP 95213211 RMS TELECOM#1', 'Pix enviado: "Cp :95213211-RMS TELECOM"'),
    ('Zona Nova Center', 669.90, '2026-04-08'::date, 'Material de Construção', 'Zona Nova Center', 'pix', 'extrato|2026-04-08|669.90|PIX ENVIADO CP 60701190 ZONA NOVA CENTER MATERIAIS DE CONSTR#1', 'Pix enviado: "Cp :60701190-ZONA NOVA CENTER MATERIAIS DE CONSTRUCAO"'),
    ('RMS Telecom', 109.90, '2026-04-17'::date, 'Internet e Telefone', 'RMS Telecom', 'pix', 'extrato|2026-04-17|109.90|PIX ENVIADO CP 95213211 RMS TELECOM#1', 'Pix enviado: "Cp :95213211-RMS TELECOM"'),
    ('Atacadão das Tintas', 551.50, '2026-05-11'::date, 'Material de Construção', 'Atacadão das Tintas', 'pix', 'extrato|2026-05-11|551.50|PIX ENVIADO CP 95213211 ATACADAO DAS TINTAS#1', 'Pix enviado: "Cp :95213211-ATACADAO DAS TINTAS"'),
    ('Opportunita Empresarial', 487.47, '2026-06-15'::date, 'Aluguel', 'Opportunita Empresarial', 'boleto', 'extrato|2026-06-15|487.47|PAGAMENTO EFETUADO OPPORTUNITA EMPRESARIAL#1', 'Pagamento efetuado: "OPPORTUNITA EMPRESARIAL"'),
    ('Atacadão das Tintas', 2000.00, '2026-06-24'::date, 'Material de Construção', 'Atacadão das Tintas', 'pix', 'extrato|2026-06-24|2000.00|PIX ENVIADO CP 95213211 ATACADAO DAS TINTAS#1', 'Pix enviado: "Cp :95213211-ATACADAO DAS TINTAS"'),
    ('Opportunita Empresarial', 439.07, '2026-07-10'::date, 'Aluguel', 'Opportunita Empresarial', 'boleto', 'extrato|2026-07-10|439.07|PAGAMENTO EFETUADO OPPORTUNITA EMPRESARIAL#1', 'Pagamento efetuado: "OPPORTUNITA EMPRESARIAL"'),
    ('Opportunita Empresarial', 143.84, '2026-07-15'::date, 'Aluguel', 'Opportunita Empresarial', 'boleto', 'extrato|2026-07-15|143.84|PAGAMENTO EFETUADO OPPORTUNITA EMPRESARIAL#1', 'Pagamento efetuado: "OPPORTUNITA EMPRESARIAL"'),
    ('Jonathan Molino', 2460.00, '2026-07-21'::date, 'Serviços de Instalação e Manutenção', 'Jonathan Molino', 'pix', 'extrato|2026-07-21|2460.00|PIX ENVIADO 00019 39641830 JONATHAN MOLINO#1', 'Pix enviado: "00019 39641830 JONATHAN MOLINO"'),
    ('Conta de Energia', 28.06, '2026-08-14'::date, 'Energia', 'CELESC', 'boleto', 'extrato|2026-08-14|28.06|PAGAMENTO EFETUADO CELESC DISTRIBUICAO S A#1', 'Pagamento efetuado: "CELESC DISTRIBUICAO S.A"'),
    ('Opportunita Empresarial', 143.79, '2026-08-14'::date, 'Aluguel', 'Opportunita Empresarial', 'boleto', 'extrato|2026-08-14|143.79|PAGAMENTO EFETUADO OPPORTUNITA EMPRESARIAL#1', 'Pagamento efetuado: "OPPORTUNITA EMPRESARIAL"'),
    ('Opportunita Empresarial', 439.63, '2026-08-14'::date, 'Aluguel', 'Opportunita Empresarial', 'boleto', 'extrato|2026-08-14|439.63|PAGAMENTO EFETUADO OPPORTUNITA EMPRESARIAL#1', 'Pagamento efetuado: "OPPORTUNITA EMPRESARIAL"'),
    ('Christian da Cunha', 1000.00, '2026-08-16'::date, 'Serviços de Instalação e Manutenção', 'Christian da Cunha', 'pix', 'extrato|2026-08-16|1000.00|PIX ENVIADO CP 60746948 CHRISTIAN DA CUNHA#1', 'Pix enviado: "Cp :60746948-Christian da Cunha"'),
    ('Leroy Merlin', 1200.00, '2026-09-07'::date, 'Material de Construção', 'Leroy Merlin', 'pix', 'extrato|2026-09-07|1200.00|PIX ENVIADO CP 60701190 LEROY MERLIN COMPANHIA BRASILEIRA DE#1', 'Pix enviado: "Cp :60701190-LEROY MERLIN COMPANHIA BRASILEIRA DE BRICOLAGEM"'),
    ('Opportunita Empresarial', 465.46, '2026-09-09'::date, 'Aluguel', 'Opportunita Empresarial', 'boleto', 'extrato|2026-09-09|465.46|PAGAMENTO EFETUADO OPPORTUNITA EMPRESARIAL#1', 'Pagamento efetuado: "OPPORTUNITA EMPRESARIAL"'),
    ('Leroy Merlin', 259.90, '2026-09-11'::date, 'Material de Construção', 'Leroy Merlin', 'pix', 'extrato|2026-09-11|259.90|PIX ENVIADO CP 60701190 LEROY MERLIN COMPANHIA BRASILEIRA DE#1', 'Pix enviado: "Cp :60701190-LEROY MERLIN COMPANHIA BRASILEIRA DE BRICOLAGEM"'),
    ('Lage Materiais de Construção', 68.77, '2026-09-14'::date, 'Material de Construção', 'Lage Materiais de Construção', 'pix', 'extrato|2026-09-14|68.77|PIX ENVIADO CP 00360305 LAGE MATERIAIS DE CONSTRUCAO#1', 'Pix enviado: "Cp :00360305-LAGE MATERIAIS DE CONSTRUCAO"'),
    ('Christian da Cunha', 600.00, '2026-09-15'::date, 'Serviços de Instalação e Manutenção', 'Christian da Cunha', 'pix', 'extrato|2026-09-15|600.00|PIX ENVIADO CP 60746948 CHRISTIAN DA CUNHA#1', 'Pix enviado: "Cp :60746948-Christian da Cunha"'),
    ('Conta de Energia', 27.89, '2026-09-16'::date, 'Energia', 'CELESC', 'boleto', 'extrato|2026-09-16|27.89|PAGAMENTO EFETUADO CELESC DISTRIBUICAO S A#1', 'Pagamento efetuado: "CELESC DISTRIBUICAO S.A"'),
    ('Jonathan Molino', 1300.00, '2026-09-16'::date, 'Serviços de Instalação e Manutenção', 'Jonathan Molino', 'pix', 'extrato|2026-09-16|1300.00|PIX ENVIADO 00019 39641830 JONATHAN MOLINO#1', 'Pix enviado: "00019 39641830 JONATHAN MOLINO"'),
    ('Lage Materiais de Construção', 9.90, '2026-09-16'::date, 'Material de Construção', 'Lage Materiais de Construção', 'pix', 'extrato|2026-09-16|9.90|PIX ENVIADO CP 00360305 LAGE MATERIAIS DE CONSTRUCAO#1', 'Pix enviado: "Cp :00360305-LAGE MATERIAIS DE CONSTRUCAO"'),
    ('Lage Materiais de Construção', 134.15, '2026-09-16'::date, 'Material de Construção', 'Lage Materiais de Construção', 'pix', 'extrato|2026-09-16|134.15|PIX ENVIADO CP 00360305 LAGE MATERIAIS DE CONSTRUCAO#1', 'Pix enviado: "Cp :00360305-LAGE MATERIAIS DE CONSTRUCAO"'),
    ('Lage Materiais de Construção', 72.50, '2026-09-16'::date, 'Material de Construção', 'Lage Materiais de Construção', 'pix', 'extrato|2026-09-16|72.50|PIX ENVIADO CP 00360305 LAGE MATERIAIS DE CONSTRUCAO#1', 'Pix enviado: "Cp :00360305-LAGE MATERIAIS DE CONSTRUCAO"'),
    ('Opportunita Empresarial', 151.05, '2026-09-16'::date, 'Aluguel', 'Opportunita Empresarial', 'boleto', 'extrato|2026-09-16|151.05|PAGAMENTO EFETUADO OPPORTUNITA EMPRESARIAL#1', 'Pagamento efetuado: "OPPORTUNITA EMPRESARIAL"'),
    ('Lage Materiais de Construção', 56.00, '2026-09-17'::date, 'Material de Construção', 'Lage Materiais de Construção', 'pix', 'extrato|2026-09-17|56.00|PIX ENVIADO CP 00360305 LAGE MATERIAIS DE CONSTRUCAO#1', 'Pix enviado: "Cp :00360305-LAGE MATERIAIS DE CONSTRUCAO"'),
    ('Mundialmix', 59.80, '2026-09-17'::date, 'Alimentação', 'Mundialmix', 'pix', 'extrato|2026-09-17|59.80|PIX ENVIADO CP 60701190 MUNDIALMIX COMERCIO DE ALIMENTOS LTD#1', 'Pix enviado: "Cp :60701190-MUNDIALMIX COMERCIO DE ALIMENTOS LTDA"'),
    ('Ceodonto', 1029.00, '2026-09-19'::date, 'Serviços de Instalação e Manutenção', 'Ceodonto', 'pix', 'extrato|2026-09-19|1029.00|PIX ENVIADO CP 18236120 CEODONTO MANUTENCAO ODONTOLOGICA#1', 'Pix enviado: "Cp :18236120-CEODONTO MANUTENCAO ODONTOLOGICA"'),
    ('João de Barro', 48.72, '2026-09-19'::date, 'Material de Construção', 'João de Barro', 'pix', 'extrato|2026-09-19|48.72|PIX ENVIADO CP 60701190 JOAO DE BARRO CASA CONSTRUCAO#1', 'Pix enviado: "Cp :60701190-JOAO DE BARRO CASA CONSTRUCAO"'),
    ('Ar-condicionado da sala', 3652.94, '2026-09-22'::date, 'Equipamentos', 'Mercado Livre', 'pix', 'extrato|2026-09-22|3652.94|PIX ENVIADO CP 10573521 PIX MARKETPLACE#1', 'Pix enviado: "Cp :10573521-PIX Marketplace"'),
    ('Casas do Cano', 105.00, '2026-09-22'::date, 'Material de Construção', 'Casas do Cano', 'pix', 'extrato|2026-09-22|105.00|PIX ENVIADO CP 00000000 CASAS DO CANO LTDA#1', 'Pix enviado: "Cp :00000000-CASAS DO CANO LTDA"'),
    ('Lage Materiais de Construção', 2.40, '2026-09-22'::date, 'Material de Construção', 'Lage Materiais de Construção', 'pix', 'extrato|2026-09-22|2.40|PIX ENVIADO CP 00360305 LAGE MATERIAIS DE CONSTRUCAO#1', 'Pix enviado: "Cp :00360305-LAGE MATERIAIS DE CONSTRUCAO"'),
    ('Cassol Centerlar', 69.90, '2026-09-23'::date, 'Móveis', 'Cassol Centerlar', 'pix', 'extrato|2026-09-23|69.90|PIX ENVIADO CP 60701190 CASSOL CENTERLAR#1', 'Pix enviado: "Cp :60701190-CASSOL CENTERLAR"'),
    ('Cassol Centerlar', 218.20, '2026-09-23'::date, 'Móveis', 'Cassol Centerlar', 'pix', 'extrato|2026-09-23|218.20|PIX ENVIADO CP 60701190 CASSOL CENTERLAR#1', 'Pix enviado: "Cp :60701190-CASSOL CENTERLAR"'),
    ('Sujinho', 188.72, '2026-09-24'::date, 'Limpeza', 'Sujinho', 'pix', 'extrato|2026-09-24|188.72|PIX ENVIADO CP 60701190 SUJINHO MATERIAIS DE LIMPEZA E UTILI#1', 'Pix enviado: "Cp :60701190-SUJINHO MATERIAIS DE LIMPEZA E UTILIDADES LTDA"'),
    ('Bem a Jeito', 128.00, '2026-09-26'::date, 'Alimentação', 'Bem a Jeito', 'pix', 'extrato|2026-09-26|128.00|PIX ENVIADO CP 90400888 BEM A JEITO BAR E RESTAURANTE LTDA#1', 'Pix enviado: "Cp :90400888-BEM A JEITO BAR E RESTAURANTE LTDA"'),
    ('Lage Materiais de Construção', 41.00, '2026-09-26'::date, 'Material de Construção', 'Lage Materiais de Construção', 'pix', 'extrato|2026-09-26|41.00|PIX ENVIADO CP 00360305 LAGE MATERIAIS DE CONSTRUCAO#1', 'Pix enviado: "Cp :00360305-LAGE MATERIAIS DE CONSTRUCAO"'),
    ('Azevedo Filhos Neg Imob', 1708.40, '2026-10-01'::date, 'Aluguel', 'Azevedo Filhos Neg Imob', 'boleto', 'extrato|2026-10-01|1708.40|PAGAMENTO DE TITULO AZEVEDO FILHOS NEG IMOB LTDA#1', 'Pagamento de Titulo: "AZEVEDO FILHOS NEG IMOB LTDA"'),
    ('Guardian Segurança', 364.50, '2026-10-01'::date, 'Custo de Operação', 'Guardian Segurança', 'pix', 'extrato|2026-10-01|364.50|PIX ENVIADO CP 74064502 GUARDIAN SERVICOS ESP DE SEGURANCA E#1', 'Pix enviado: "Cp :74064502-GUARDIAN SERVICOS ESP DE SEGURANCA E AUTOMACAO"')
       ) as v(descricao, valor, pago_em, categoria, fornecedor, meio, chave, extrato)
 where not exists (select 1 from public.financial_transactions f where f.source_type = 'importacao-extrato' and f.source_id = v.chave);

-- ── 6. As faturas pagas de que não temos o detalhe ────────────────────────
--
-- Março e abril do Inter foram pagos e o arquivo da fatura não existe. Sem
-- parcela nenhuma, o único registro possível é o próprio pagamento — e deixá-lo
-- de fora faria o caixa daqueles meses parecer menor do que foi.
--
-- Vai sem categoria DE PROPÓSITO: ninguém sabe o que foi comprado, e inventar
-- uma categoria aqui mentiria no rateio por hora de cadeira. Aparece em
-- Pagamentos como 'sem categoria', que é a verdade.

insert into public.financial_transactions (owner_id, unit_id, type, status, description, amount, due_date, paid_date, account_id, payment_method, source_type, source_id, notes)
select 'a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'payable', 'paid', 'Fatura Banco Inter Crédito — detalhe não informado', 2273.33, '2026-03-20', '2026-03-26', 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', 'fatura', 'importacao-extrato', 'fatura-sem-detalhe|Inter|2026-03', 'O arquivo desta fatura não foi importado, então não há as compras dentro dela. Quando a fatura for juntada, apagar esta linha e lançar as compras.'
 where not exists (select 1 from public.financial_transactions f where f.source_type = 'importacao-extrato' and f.source_id = 'fatura-sem-detalhe|Inter|2026-03');
insert into public.financial_transactions (owner_id, unit_id, type, status, description, amount, due_date, paid_date, account_id, payment_method, source_type, source_id, notes)
select 'a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'payable', 'paid', 'Fatura Banco Inter Crédito — detalhe não informado', 147.39, '2026-04-20', '2026-04-16', 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', 'fatura', 'importacao-extrato', 'fatura-sem-detalhe|Inter|2026-04', 'O arquivo desta fatura não foi importado, então não há as compras dentro dela. Quando a fatura for juntada, apagar esta linha e lançar as compras.'
 where not exists (select 1 from public.financial_transactions f where f.source_type = 'importacao-extrato' and f.source_id = 'fatura-sem-detalhe|Inter|2026-04');

-- ── 7. As correções no que já estava lançado ──────────────────────────────
--
-- Vale mais que lançar o que falta: é despesa que o sistema já tem e mostra
-- errado. Cada UPDATE é guardado pela condição que ele mesmo destrói, então
-- rodar de novo não faz nada.

-- Sinal de Locação — no banco sai como "Azevedo Filhos Neg Imob"
update public.financial_transactions set supplier_name = 'Azevedo Filhos Neg Imob', updated_at = now()
 where id = '1d1b914a-6993-4f38-b8a3-3e8a1263cc92' and supplier_name = 'Pirâmides Imobiliária';

-- Instalação da Cadeira Odontológica · Ceodonto — pago em 2026-05-21, e não em 2026-05-25
update public.financial_transactions set paid_date = '2026-05-21', updated_at = now()
 where id = '4b03a788-9879-48dc-9bf5-6928c74c9533' and paid_date = '2026-05-25';

-- Esquadrias da Sala — Entrada · Full Esquadrias — pago em 2026-06-12, e não em 2026-06-11
update public.financial_transactions set paid_date = '2026-06-12', updated_at = now()
 where id = '91d0bfbb-f51a-4c39-bb44-3f295061d548' and paid_date = '2026-06-11';

-- Conta de Energia · CELESC — vencimento 2026-07-15 não bate com o pagamento
update public.financial_transactions set due_date = '2026-06-15', updated_at = now()
 where id = 'e2bb49bf-27dd-4b14-ad26-d2e652780ca9' and due_date = '2026-07-15';

-- Seguro Incêndio — no banco sai como "Opportunita Empresarial"
update public.financial_transactions set supplier_name = 'Opportunita Empresarial', updated_at = now()
 where id = 'faaf6635-47ee-43db-b328-89ae50029367' and supplier_name = 'BR Condos';

-- Aluguel da Sala — no banco sai como "Azevedo Filhos Neg Imob"
update public.financial_transactions set supplier_name = 'Azevedo Filhos Neg Imob', updated_at = now()
 where id = '41cfbd4e-d149-44fd-82f7-d66c93977af1' and supplier_name = 'Pirâmides Imobiliária';

-- Material para Instalação Elétrica — no banco sai como "Pedra Branca"
update public.financial_transactions set supplier_name = 'Pedra Branca', updated_at = now()
 where id = 'ac592e7d-b2f6-4bba-b115-93574d675ff6' and supplier_name = 'Casa Da Água';

-- Esquadrias da Sala (1/6) · Full Esquadrias — Pagamento efetuado: "FULL ESQUADRIAS"
update public.financial_transactions set status = 'paid', paid_date = '2026-07-15', updated_at = now()
 where id = 'f601e842-2979-478a-83ae-2dd1b3435a54' and status <> 'paid';

-- Esquadrias da Sala (2/6) · Full Esquadrias — Pagamento efetuado: "FULL ESQUADRIAS"
update public.financial_transactions set status = 'paid', paid_date = '2026-08-14', updated_at = now()
 where id = '2837c253-334d-4aba-b209-19ac381c144f' and status <> 'paid';

-- Esquadrias da Sala (3/6) · Full Esquadrias — Pagamento efetuado: "FULL ESQUADRIAS"
update public.financial_transactions set status = 'paid', paid_date = '2026-09-16', updated_at = now()
 where id = 'a6a9063e-5a90-4b7b-81e2-8fc2b79fe2dd' and status <> 'paid';

-- ── 8. A diferença entre o que foi pago e o que estava lançado ────────────
--
-- A Esquadrias 3/6 é de R$ 1.715,00 e saiu R$ 1.749,48. A parcela foi marcada
-- paga no bloco 7 pelo valor dela; a diferença entra aqui, como Juros, para o
-- caixa fechar sem mexer no valor da parcela.

insert into public.financial_transactions (owner_id, unit_id, type, status, description, amount, due_date, paid_date, category_id, supplier_name, account_id, payment_method, source_type, source_id, notes)
select 'a206246b-a797-48af-93f7-7dc6db3a266d', '1165e982-616f-4ecd-a555-27f9b64e9134', 'payable', 'paid', 'Juros/correção — Esquadrias da Sala (3/6)', 34.48, '2026-09-16', '2026-09-16', (select id from public.financial_categories where owner_id = 'a206246b-a797-48af-93f7-7dc6db3a266d' and name = 'Juros' limit 1), 'Full Esquadrias', 'd70515ef-77db-4e54-9180-e6e3b7bafdd0', 'boleto', 'importacao-extrato', 'diferenca|2026-09-16|Esquadrias da Sala (3/6) · Full Esquadrias', 'pago R$ 1.749,48 contra R$ 1.715,00 lançados — juros, correção ou valor digitado errado?'
 where not exists (select 1 from public.financial_transactions f where f.source_type = 'importacao-extrato' and f.source_id = 'diferenca|2026-09-16|Esquadrias da Sala (3/6) · Full Esquadrias');

-- ── 9. As faturas que já foram pagas — O ÚLTIMO BLOCO ─────────────────────
--
-- Aqui é onde o dinheiro sai do caixa, e é a única linha de cada mês que sai.
-- A soma das parcelas da fatura, que `card_invoice_recalc` já calculou, bate ao
-- centavo com o que o banco debitou no dia abaixo.
--
-- Depois deste bloco a fatura está congelada: nenhuma compra nova entra nela.
-- É por isso que ele vem no fim.

-- Banco Inter Crédito, fatura que fechou em 2026-05-13 — paga em 2026-05-25
update public.financial_transactions t
   set status = 'paid', paid_date = '2026-05-25', updated_at = now()
  from public.card_invoices i where t.settles_card_invoice_id = i.id and i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'
   and i.closing_date = '2026-05-13' and t.status <> 'paid';

-- Banco Inter Crédito, fatura que fechou em 2026-06-13 — paga em 2026-06-23
update public.financial_transactions t
   set status = 'paid', paid_date = '2026-06-23', updated_at = now()
  from public.card_invoices i where t.settles_card_invoice_id = i.id and i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'
   and i.closing_date = '2026-06-13' and t.status <> 'paid';

-- Banco Inter Crédito, fatura que fechou em 2026-07-13 — paga em 2026-07-23
update public.financial_transactions t
   set status = 'paid', paid_date = '2026-07-23', updated_at = now()
  from public.card_invoices i where t.settles_card_invoice_id = i.id and i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'
   and i.closing_date = '2026-07-13' and t.status <> 'paid';

-- Banco Inter Crédito, fatura que fechou em 2026-08-13 — paga em 2026-08-20
update public.financial_transactions t
   set status = 'paid', paid_date = '2026-08-20', updated_at = now()
  from public.card_invoices i where t.settles_card_invoice_id = i.id and i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'
   and i.closing_date = '2026-08-13' and t.status <> 'paid';

-- Mercado Pago Crédito, fatura que fechou em 2026-09-11 — paga em 2026-09-20
update public.financial_transactions t
   set status = 'paid', paid_date = '2026-09-20', updated_at = now()
  from public.card_invoices i where t.settles_card_invoice_id = i.id and i.card_id = 'ddcbbc2a-b6f6-4c1f-8aa8-b71d11ec084c'
   and i.closing_date = '2026-09-11' and t.status <> 'paid';

-- Banco Inter Crédito, fatura que fechou em 2026-09-13 — paga em 2026-09-21
update public.financial_transactions t
   set status = 'paid', paid_date = '2026-09-21', updated_at = now()
  from public.card_invoices i where t.settles_card_invoice_id = i.id and i.card_id = 'cdd3b1b6-b986-4bd8-8aa3-e06c43623254'
   and i.closing_date = '2026-09-13' and t.status <> 'paid';

-- ── 10. Um nome por fornecedor ────────────────────────────────────────────
--
-- O extrato escreve em CAIXA ALTA e sem acento; a clínica digitou com acento.
-- Sem isto o mesmo fornecedor aparece duas vezes no relatório, com o gasto
-- dividido entre as grafias — aconteceu com a Lage, 7 linhas de um lado e 2 do
-- outro. As três últimas trocas não são grafia e sim identidade: Pirâmides assina
-- AZEVEDO FILHOS no banco, BR Condos é a OPPORTUNITA, e Jonathan Ariel é o
-- JONATHAN MOLINO.
--
-- Idempotente porque o UPDATE exige que o nome ainda seja o antigo.

update public.financial_transactions t
   set supplier_name = v.canonico, updated_at = now()
  from (values
    ('^LAGE MATERIAIS', 'Lage Materiais de Construção'),
    ('^CASSOL', 'Cassol Centerlar'),
    ('^ATACADAO DAS TINTAS', 'Atacadão das Tintas'),
    ('^LEROY MERLIN', 'Leroy Merlin'),
    ('^ZONA NOVA', 'Zona Nova Center'),
    ('^GUARDIAN', 'Guardian Segurança'),
    ('^BEM A JEITO', 'Bem a Jeito'),
    ('^CASAS DO CANO', 'Casas do Cano'),
    ('^MUNDIALMIX', 'Mundialmix'),
    ('^JOAO DE BARRO', 'João de Barro'),
    ('^PEDRA BRANCA', 'Pedra Branca'),
    ('^CASAS? DA AGUA|^Casa Da Água', 'Casas da Água'),
    ('^SUJINHO', 'Sujinho'),
    ('^PIR[AÂ]MIDES|^AZEVEDO FILHOS', 'Azevedo Filhos Neg Imob'),
    ('^BR CONDOS|^OPPORTUNITA', 'Opportunita Empresarial'),
    ('^JONATHAN', 'Jonathan Molino')
       ) as v(padrao, canonico)
 where t.owner_id = 'a206246b-a797-48af-93f7-7dc6db3a266d'
   and t.supplier_name ~* v.padrao
   and t.supplier_name <> v.canonico;

