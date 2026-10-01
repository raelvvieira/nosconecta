# Como preencher as duas planilhas

São duas, e a divisão é o que faz o fluxo de caixa ficar certo.

| arquivo | o que vai nele | de onde você tira |
|---|---|---|
| `extrato.csv` | o que **saiu ou entrou da conta** no mesmo dia | extrato do Inter, Nubank e Mercado Pago |
| `cartao.csv` | o que você **comprou no cartão** | faturas do Inter Crédito e Mercado Pago Crédito |

---

## A regra que não pode ser quebrada

**A linha "PAGAMENTO FATURA CARTÃO" do extrato NÃO entra em lugar nenhum.**

É a armadilha clássica. Se você lançar as compras da fatura (em `cartao.csv`)
**e também** o pagamento da fatura (do extrato), o mesmo gasto conta duas vezes
e o mês parece o dobro do que foi.

O sistema monta a fatura sozinho, somando as compras, e ela aparece em
Pagamentos para você dar baixa quando pagar. Você não precisa lançá-la.

Pule também, no extrato:

- transferência entre as suas próprias contas (Inter → Nubank, por exemplo);
- aplicação e resgate de investimento;
- estorno que já tem a compra correspondente estornada.

---

## Compra parcelada: UMA linha, valor TOTAL

Esse é o que mais dá confusão.

A fatura mostra assim:

```
29/09   OLSEN INDUSTRIA   3/10   R$ 325,62
```

Você olha e pensa em lançar R$ 325,62 em setembro. **Não.** O certo é:

```
data_da_compra: 29/05/2026     ← quando você COMPROU, não a parcela
valor_total:    3.256,20       ← o preço inteiro, não a parcela
parcelas:       10
```

O sistema divide nas dez faturas sozinho, cada uma na data certa. Lançar parcela
por parcela criaria dez compras de R$ 3.256,20.

Se não sabe a data original, use a data da primeira parcela que aparecer e conte
para trás: parcela 3/10 em setembro quer dizer compra em julho.

Compra à vista no cartão: `parcelas` = 1.

---

## As colunas

### `extrato.csv`

| coluna | o que é | exemplo |
|---|---|---|
| `data` | o dia que o dinheiro mexeu | `30/06/2026` |
| `tipo` | `saida` ou `entrada` | `saida` |
| `valor` | só o número, sem R$ | `1.489,75` |
| `conta` | de qual conta saiu | `Banco Inter` |
| `descricao` | o que foi | `Aluguel da sala` |
| `fornecedor` | para quem (ou de quem) | `Pirâmides Imobiliária` |
| `categoria` | ver a lista abaixo | `Aluguel` |
| `forma` | `pix`, `boleto`, `debito`, `transferencia` | `pix` |

**Entradas:** só até **17/08/2026**. De 18/08 em diante a agenda já registra os
recebimentos (são 26, R$ 14.267,00), e importar de novo contaria duas vezes. O
importador recusa entrada depois dessa data para você conferir caso a caso.

### `cartao.csv`

| coluna | o que é | exemplo |
|---|---|---|
| `data_da_compra` | quando comprou, NÃO o vencimento | `29/05/2026` |
| `cartao` | `Banco Inter Crédito` ou `Mercado Pago Crédito` | `Banco Inter Crédito` |
| `valor_total` | o preço inteiro, não a parcela | `3.256,20` |
| `parcelas` | quantas vezes (1 = à vista) | `10` |
| `descricao` | o que foi | `Cadeira odontológica` |
| `fornecedor` | onde comprou | `Olsen` |
| `categoria` | ver a lista abaixo | `Equipamentos` |

---

## As categorias

Já existem no sistema:

`Aluguel` · `Custo de Operação` · `Equipamentos` · `Juros` ·
`Material de Construção` · `Móveis` · `Serviços de Instalação e Manutenção` ·
`Taxas de Operação`

Vou criar estas, que faltam para o custo de operar:

`Salários e Pró-labore` · `Energia` · `Água` · `Internet e Telefone` ·
`Software e Assinaturas` · `Contador` · `Impostos` · `Material de Consumo` ·
`Laboratório` · `Anúncios` · `Limpeza` · `Alimentação`

Se precisar de uma que não está aqui, escreva o nome que eu crio. Não invente
duas grafias para a mesma coisa ("Energia" e "Luz") — vira duas categorias e as
contas se separam sem motivo.

**`Anúncios` fica separada de propósito:** ela não pode entrar no rateio do custo
por hora de cadeira, senão todo procedimento fica mais caro por causa de
marketing e a precificação sai torta.

---

## Dicas para preencher rápido

- Quase todo banco exporta extrato em CSV ou OFX. Exporte, abra no Excel, e cole
  as colunas em vez de digitar.
- Preencha a categoria por blocos: ordene por descrição, e todo "CELESC" vira
  `Energia` de uma vez.
- Não se preocupe em acertar tudo. O importador **confere antes de gravar** e
  devolve um relatório com o que ficou estranho — valor sem número, categoria
  desconhecida, data fora de maio/outubro, possível duplicata. Nada entra no
  sistema sem você ver esse relatório.

Quando terminar um dos dois arquivos, me manda que eu escrevo o importador.
Pode ser um de cada vez — não precisa esperar os dois.
