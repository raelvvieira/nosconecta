# Luna — o que muda por conta e o que fica na MD

Mapa de como a instrução da Luna é montada hoje (`supabase/functions/_shared/instrucao-do-agente.ts`)
e de onde cada dado de cliente deve morar. Serve de base para reescrever a MD (V4.2) de forma
que ela funcione para qualquer consultório, não só para a NÓS.

## Como a instrução é montada (ordem real)

1. Abertura fixa: "Você atende pacientes por WhatsApp em nome de {consultório}."
2. **A MD da clínica** (`ai_agents.instrucao_base`) — entra do jeito que está escrita, **sem nenhuma troca de variável**.
3. De onde a pessoa veio (anúncio), se veio de anúncio.
4. Cidade (catálogo de unidades, cidade confirmada ou palpite).
5. Unidades e endereços.
6. Quem atende (profissionais e especialidades).
7. Tabela de preços (procedimentos + parcelamento).
8. Condições do consultório (pagamento, avaliação, falta, cancelamento).
9. Campanhas válidas hoje.
10. Horários reais livres para oferecer.
11. Módulo de Paciente Modelo / harmonização (só se ligado), ou a proibição de falar disso.
12. Biblioteca de casos (antes e depois).
13. Dúvida encaminhada (estado da conversa).
14. Regras invioláveis, fixas no código (repasse para humano, nunca inventar, valor antes de horário, não repetir…).

> Consequência: tudo que está **escrito dentro da MD** (nome "Luna", "Dra. Mariane", "Florianópolis",
> "R$ 399", combos) vale para **todas** as contas. Para a NÓS está certo; para outro consultório é erro.

## Camada 1 — Dados da conta (o sistema injeta; a MD NUNCA digita)

| Dado | De onde vem (tela) | Como entra hoje |
|---|---|---|
| Nome do consultório | Configurações > Consultório | Frase de abertura |
| Nome da assistente | Agente de IA | Só em um exemplo da regra 8. **A MD diz "Luna" fixo** |
| Quem faz a avaliação | Configurações > Consultório | Só em seções injetadas. **A MD diz "Dra. Mariane" 75x** |
| Área de atuação (odonto, estética, ambas, médica) | Consultório | Define catálogo e telas |
| Unidades: nome, endereço, link do mapa, como chegar | Configurações > Unidades | Seção de unidades e de cidade |
| Horários de funcionamento e vagas reais | Unidades + Agenda | Seção de horários (só horários que existem) |
| Equipe: profissionais, especialidades, CRO | Configurações > Cadeiras/Profissionais | Seção "quem atende" |
| Tabela de preços (procedimentos, "a partir de") | Configurações > Procedimentos | Tabela de preços |
| Formas de pagamento, parcelas máximas, juros, parcela mínima | Consultório > Pagamento | Condições |
| Avaliação: gratuita ou paga, valor, se abate | Consultório | Condições |
| Política de falta e de cancelamento | Consultório | Condições |
| Pode informar preço de harmonização? | Consultório | Condições |
| Campanhas com validade e preço | Configurações > Campanhas | Campanhas válidas hoje |
| Anúncio de origem | Meta | Seção do anúncio |
| Paciente modelo / mentoria (edições, datas, ofertas, sinal, FAQ) | Agente de IA > Módulos | Módulo, só se ligado |
| Casos de antes e depois | Configurações > Biblioteca de casos | Seção de casos |

## Camada 2 — Fixo no código (não depende de conta nem de MD)

- Quando passar a conversa para uma pessoa (dor, urgência, reclamação, pedido de humano…).
- Nunca inventar preço, horário, endereço, nome.
- Nunca orientação clínica. Nunca prometer prazo ou desconto.
- Valor antes de horário; um pergunta por mensagem; não repetir o que já disse.
- Sem travessão; emoji raro; não se declarar IA a menos que perguntem.

> A MD tem 18 regras próprias (A1). Várias repetem estas. Onde divergirem, **vale o código**.
> Ao reescrever, remover da MD o que o código já garante e ficar só com o que é método.

## Camada 3 — Método (vale para todas as contas; é o que a MD deve ser)

Tom e linguagem, abertura, descoberta, venda consultiva, sinais de compra, objeções, prova social,
agendamento, quando não responder, FAQ clínica educativa, urgência, Recovery (lógica das trilhas,
sem horários — quem decide quando é o motor), checklist de mensagem, bolhas.

## O que hoje está escrito DENTRO da MD e é da NÓS (precisa sair ou virar variável)

| Onde na MD | O que é | Destino |
|---|---|---|
| A2 Identidade | "Luna, auxiliar da Dra. Mariane, da NÓS" | Variáveis: assistente, responsável, consultório |
| A8 Localização | Florianópolis / Porto Alegre, exemplos de cidades | Genérico: "as unidades listadas na seção de unidades" |
| A9 Especialidades | Formação e áreas da Dra. Mariane | Vem do cadastro de profissionais; MD só diz como responder |
| Exemplos em A3/A4/B4/B5 | "R$ 399", "combo", Dra. Mariane, cidades | Colchetes de campo dinâmico: `[PREÇO DA TABELA]`, `[UNIDADE]`… |
| C2 / C2B | Combo limpeza+clareamento; Black Estética nov/2026 | **Campanhas** (cadastro) ou "Extensão NÓS" |
| C3 | Restaurações e avaliação gratuita | Avaliação vem das Condições; resto vira método |
| C5 | FAQ de estética facial | Fica, se neutro; senão só para contas com estética |
| C8 | Mentoria e paciente modelo | **Módulo** (já existe); MD só o gancho |
| D (Recovery) | Exemplos com nomes e ofertas da NÓS | Exemplos neutros com variáveis |
| E6/E13 | Testes com casos reais (Camily, Leilane, Isa, Vic) | Arquivo de testes à parte, por conta |
| Anexo S | Fatos do sistema da NÓS (até 12x, "R$ 399 do histórico") | Sai da MD; é condição da conta |

Contagem na V4.2 hoje: "Mariane" 75x, "Luna" 85x, cidades 27x, valores em R$ 28x.

## Variáveis que precisam existir (hoje NÃO existem — a MD é inserida sem troca)

| Variável na MD | Vira | Fonte |
|---|---|---|
| `{{ASSISTENTE}}` | Luna / Bia / … | ai_agents.name |
| `{{CONSULTORIO}}` | NÓS Odontologia | clinicas.nome |
| `{{RESPONSAVEL}}` | a Dra. Mariane / o Dr. Paulo / a equipe | clinicas.responsavel_avaliacao (com artigo) |
| `{{RESPONSAVEL_NOME}}` | Dra. Mariane (sem artigo) | idem |

Preço, cidade, endereço, horário, forma de pagamento: **sem variável** — a MD manda "usar a seção X
desta instrução", porque o sistema já escreve essas seções.

## Regra de ouro para a MD nova

1. Nenhum nome próprio, cidade, valor ou oferta escrito dentro da MD.
2. Todo exemplo usa variável (`{{…}}`) ou colchete de campo dinâmico (`[PREÇO DA TABELA]`).
3. Se o sistema já injeta o dado, a MD só diz **como usar**, não repete o dado.
4. O que for só da NÓS vai para a conta da NÓS (campanhas, módulo, "manual da clínica"), não para o núcleo.
