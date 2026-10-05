# O financeiro da clínica

Maio a outubro de 2026 está lançado. O que segue é como foi feito e como
continuar — não é preciso digitar lançamento por lançamento.

## Como entrar com um período novo

Baixe os arquivos **como o banco exporta** e rode o importador. Ele não escreve
nada no banco: gera uma proposta e um relatório para você conferir antes.

```bash
# extrato e fatura do Mercado Pago em PDF → texto
pdftotext -layout Extrato.pdf  extrato.txt
pdftotext -layout FaturaMP.pdf fatura-mp.txt

node scripts/importar-financeiro.mjs \
  --extrato extrato.txt \
  --fatura-inter faturas-inter.xlsx \
  --fatura-mp fatura-mp.txt \
  --existentes existentes.csv \
  --cartoes cartoes.csv \
  --contexto contexto.csv \
  --sql supabase/migrations/<data>_lancamentos.sql
```

A saída cai em `financeiro/importacao/`, que o git ignora: extrato tem nome de
terceiro e valor de conta pessoal dentro.

**Leia `RELATORIO.md` antes de aplicar o SQL.** A primeira tabela é a que
importa: a soma das parcelas de cada fatura tem de bater, ao centavo, com o que
o banco debitou. Se não bater, está faltando fatura — pare e junte.

## A regra que o sistema segue

Uma linha de `financial_transactions` tem três naturezas, e a diferença está em
duas colunas:

| natureza | como se reconhece | é caixa? |
|---|---|---|
| saída comum (pix, boleto) | as duas colunas vazias | **sim** |
| compra no cartão | tem `card_invoice_id` | **não** |
| a fatura do cartão | tem `settles_card_invoice_id` | **sim** |

Por isso a parcela do cartão fica `pending` para sempre, mesmo de fatura já
quitada: ela não é saída de caixa. Quem sai do caixa é a **fatura**, uma linha
por mês somando todas as compras — e é ela que recebe a data de pagamento.

Em 21/09 saíram R$ 5.827,80 da conta. Isso é a parcela 5 da cadeira do Olsen
mais as outras doze compras daquela fatura. Lançar também o "pagamento de
fatura" do extrato faria esse dia contar duas vezes.

As telas já leem das duas formas: **"Pago no período"** filtra por data de
pagamento (é o caixa), **"Total previsto"** e **"A pagar"** filtram por
vencimento (é o compromisso). A mesma parcela alimenta os dois, cada um pela sua
data. Você não precisa escolher.

## O que fica de fora, de propósito

- **Pagamento de fatura de cartão.** A despesa é a parcela. Exceção: fatura paga
  cujo detalhe não existe — aí o pagamento é o único registro possível, e entra
  **sem categoria**, porque ninguém sabe o que foi comprado.
- **Aplicação e resgate de CDB, aporte de sócio, transferência entre contas
  suas.** Dinheiro mudando de bolso.
- **Dinheiro de outro negócio.** Os nomes confirmados estão numa lista dentro do
  importador (`REGRAS_DO_EXTRATO`), então o próximo extrato os reconhece sozinho.
- **Entrada na conta.** Não vira receita. Receita do consultório nasce de
  consulta realizada com valor cobrado; lançar entrada de banco duplicaria o
  faturamento e estragaria o retorno dos anúncios.

## Um nome por fornecedor

O extrato escreve `LAGE MATERIAIS DE CONSTRUCAO` e a clínica digitou
`Lage Materiais de Construção`. Enquanto as duas grafias convivem, o relatório
por fornecedor mostra o mesmo fornecedor duas vezes com o gasto dividido, e
nenhum dos dois números é o verdadeiro. A lista canônica está em
`NOME_DO_FORNECEDOR`, no importador — para acrescentar um fornecedor novo, é uma
linha ali.

## As categorias

`Água` · `Alimentação` · `Aluguel` · `Anúncios` · `Contador` ·
`Custo de Operação` · `Energia` · `Equipamentos` · `Impostos` ·
`Internet e Telefone` · `Juros` · `Laboratório` · `Limpeza` ·
`Material de Construção` · `Material de Consumo` · `Móveis` ·
`Salários e Pró-labore` · `Serviços de Instalação e Manutenção` ·
`Software e Assinaturas` · `Taxas de Operação`

Não invente duas grafias para a mesma coisa ("Energia" e "Luz"): vira duas
categorias e as contas se separam sem motivo.

**`Anúncios` fica separada de propósito:** ela não pode entrar no rateio do custo
por hora de cadeira, senão todo procedimento fica mais caro por causa de
marketing e a precificação sai torta.

## O que ainda falta

- **As faturas de março e abril do Inter.** Foram pagas (R$ 2.420,72 no total) e
  o arquivo não existe. Estão lançadas como pagamento sem categoria; quando você
  juntar as faturas, apague essas duas linhas e lance as compras.
- **Conferir as categorias que são suposição minha.** Estão marcadas no
  relatório. As maiores: Marmoraria Passos (R$ 4.900) e IR Comércio de Tintas
  (R$ 3.629) em `Material de Construção`.
- **Sete lançamentos de aluguel sem lastro no extrato**, e três deles — Seguro
  Incêndio R$ 239,44 + Calção R$ 176,40 + Juros R$ 4,86 — somam exatamente
  R$ 420,70, igual ao "Sinal de Locação" que o banco confirma em 06/05. O
  extrato mostra **um** pagamento de R$ 420,70 nesse dia, não dois. Vale
  conferir se não é o mesmo pagamento lançado duas vezes.
