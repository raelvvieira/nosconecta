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

## As contas, e a postura de leitura de cada uma

Esta é a regra mais importante do financeiro, e ela **não é a mesma para todas
as contas**. Aplicar a postura errada é o jeito mais fácil de encher o sistema
de gasto pessoal — ou de perder despesa real do consultório.

**O consultório não tem conta própria.** Existem quatro contas, e nenhuma é da
clínica:

| Conta | De quem é | Como é lida |
|---|---|---|
| **Stone** | Mariane — é onde o consultório **recebe** (cartão e pix) | entradas não viram receita (quem tem receita é a agenda); saídas são do consultório |
| **Inter (Rael)** + cartão | pessoal do Rael | **nada é do consultório**, só o que for identificado |
| **Nubank (Rael)** | pessoal do Rael | idem |
| **Nubank (Mariane)** | pessoal da Mariane | idem |
| **Mercado Pago (Rael)** + cartão | pessoal do Rael | idem |

Os dois sócios pagaram custo da clínica das próprias contas: o aluguel, a luz,
o condomínio e a cadeira saíram do Inter do Rael; os insumos e o laboratório
saíram do Nubank da Mariane.

Por isso **a postura padrão é `pessoal`**, e não "é da clínica": numa conta de
pessoa física o silêncio significa *"não é do consultório"*. A primeira versão
do importador leu o Inter como conta da clínica — e junto com o aluguel entraram
um bar e um mercado, R$ 355,10 de gasto pessoal classificado como da clínica.
Pouco, e só pouco por sorte.

Errar para o lado de excluir deixa despesa de fora, e isso aparece na
conferência. Errar para o lado de incluir enfia gasto pessoal no custo por hora
de cadeira, onde ninguém vai procurar.

Tratar o Nubank como as outras traria para o financeiro o plano de saúde, as
doações e os R$ 28.941 de transferência que o relatório deixou como "a
classificar". Por isso o importador tem a opção `--postura`:

```bash
node scripts/importar-financeiro.mjs --extrato nubank.txt --postura pessoal …
```

Em setembro, saíram da conta pessoal **R$ 11.223,87 que são do consultório**:
insumos odontológicos, laboratório de prótese e anúncios. Esses entraram. O
resto da conta, não.

**A partir de agora todos os recebimentos se concentram na Stone.** Isso é a
decisão que torna o financeiro conferível: com receita entrando por uma conta
só, o extrato da Stone passa a bater contra a agenda, e sobra um único lugar
para procurar quando não bate.

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
- **Gasto pessoal da sócia.** Numa conta de postura `pessoal` isso é o padrão —
  não precisa de lista.
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

## O que é previsão, e o que não é

Duas naturezas de linha futura, e a diferença não é de confiança no número:

| | Entra? | Por quê |
|---|---|---|
| **Aluguel e condomínio** | **sim**, como `previsao-contrato` | contrato assinado: vence de novo no dia 31 independentemente de qualquer coisa |
| Imposto, DAS, pró-labore | não | dependem de um faturamento que ainda não aconteceu |
| Energia, limpeza | não | o valor varia e não há contrato de valor fixo |

As previstas usam **o último valor pago**, nunca a média: o condomínio subiu três
meses seguidos (582,91 → 583,42 → 616,51) e aluguel não cai. Errar para baixo
numa previsão de pagamento é o erro que dói.

Elas carregam `source_type = 'previsao-contrato'`, que as separa do que veio de
arquivo (`importacao-*`) e do que veio da agenda (`agendamento`). Quando o
boleto chegar, é conferir o valor e dar baixa — não criar linha nova.

## Nada simulado entra

Imposto, DAS, pró-labore e reserva de caixa **não são lançados**. Eles são
cálculo para decidir, não fato. O sistema só tem o que saiu ou entrou de verdade
num extrato, numa fatura ou numa consulta confirmada na agenda.

Isso é escolha, e tem um preço: o custo por hora que o sistema mostra é menor
que o real, porque falta o imposto. Vale a pena porque o contrário é pior —
número estimado dentro do financeiro vira número tratado como verdade três meses
depois, quando ninguém lembra que era estimativa.

## Gasto pessoal que já foi decidido

Cinco itens entraram como do consultório e não eram. Ficaram com status
`cancelled`, não apagados: assim a chave de origem continua no banco e o índice
único impede que a próxima importação os traga de volta. `cancelled` fica fora
de todo indicador.

| | |
|---|---:|
| Bem a Jeito (bar) | 128,00 |
| Mundialmix (mercado) | 59,80 |
| Roote (software) | 79,90 |
| Claro (telefone) | 57,90 |
| Seguro do cartão Inter, 5 parcelas | 29,50 |

Os nomes estão em `REGRAS_DO_EXTRATO` e `FORA_DO_CARTAO`, dentro do importador.
Estar na postura `pessoal` não bastava: conta pessoal também paga coisa da
clínica, e quem for revisar linha por linha precisa ver que estas já foram
decididas.

**Uma consequência que vale entender:** a fatura do cartão Inter no sistema passa
a valer menos que o débito no banco, exatamente os R$ 5,90 do seguro por mês.
Isso está certo — a fatura é do cartão do Rael, e o sistema guarda a parte do
consultório.

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
