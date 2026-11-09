# Briefing para escrever a nova MD da assistente (Agente Core)

Este documento é para quem vai escrever a nova versão da MD da assistente e não vê o código do
sistema. Ele explica o que o sistema já faz sozinho, o que a MD continua precisando dizer e o que
deve sair dela.

## 1. Divisão de papéis

- **O sistema guarda e entrega os fatos:** preços, datas, vagas, endereços, horários, sinal,
  regras de cada oferta, quem atende, casos autorizados. Isso vem do cadastro, a cada conversa.
- **A MD ensina o jeito de conversar:** tom, humanização, venda consultiva, objeções, como
  conduzir para o agendamento, o que fazer diante de dúvida. Nada de fato escrito à mão.

Se a MD e o cadastro divergirem, vale o cadastro.

## 2. Variáveis de identidade

A MD pode usar só estas quatro, e o sistema as troca antes de enviar a instrução:

- `{{ASSISTENTE}}`: o nome da assistente.
- `{{CONSULTORIO}}`: o nome do consultório.
- `{{RESPONSAVEL}}`: a pessoa que faz a avaliação, com o artigo e o título ("a Dra. Mariane").
- `{{RESPONSAVEL_NOME}}`: só o nome.

Qualquer outra chave `{{...}}` é recusada pela tela do manual. Chave solta (`{{` sem par) também.

## 3. Cabeçalho da MD

O sistema reconhece a versão do núcleo pelo cabeçalho. Se os primeiros 400 caracteres tiverem
`AGENTE CORE V5`, ele usa a regra fixa de preço da V5 (o valor pedido sai no mesmo turno; o
horário só depois do valor). Sem esse cabeçalho, vale a regra antiga (a da V4.x). A nova MD deve
manter o cabeçalho `AGENTE CORE V5.x`.

## 4. Ordem em que a assistente lê a instrução

1. Abertura e **a MD** (como atender).
2. **De onde a pessoa veio** (o anúncio): é só uma pista de contexto.
3. Cidade da pessoa, unidades (endereço, mapa), quem atende.
4. Tabela de preços (procedimentos e valores normais) e condições de pagamento e políticas.
5. **O que está valendo agora** (novo): as ofertas abertas hoje.
6. Horários reais disponíveis.
7. Quando a conversa é de paciente modelo: a seção própria dele (edição aberta, datas, horários,
   vagas, sinal, regras).
8. Casos autorizados (antes e depois) e dúvida já encaminhada à equipe.
9. **Regras que a assistente nunca pode quebrar**, sempre por último e mandando sobre tudo.

A MD é lida primeiro. O que o sistema coloca depois restringe e completa a MD.

## 5. Ofertas

Camadas:

| Camada        | O que é                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Procedimentos | O que a clínica faz, com o preço normal                                                         |
| **Ofertas**   | Algo especial, com destaque e regras próprias: Paciente Modelo, Mentoria, uma promoção de preço |
| Campanhas     | Os disparos e anúncios que levam as pessoas até a clínica                                       |

Cada oferta tem: nome, período, situação, **para quem é** (pacientes, profissionais ou qualquer
pessoa), **como reconhecer** (palavras e situações), preços ou resumo da edição, e **instruções
comerciais** (curtas, com limite de tamanho).

O bloco "O que está valendo agora" lista só as ofertas abertas hoje e termina com regras de uso.
A assistente decide pelo que a pessoa diz, e não pelo anúncio. Mensagem vaga pede uma única
pergunta. Oferta encerrada ou sem vaga é dita com honestidade.

## 6. Como o público da conversa é decidido

Há três públicos: atendimento, paciente modelo e mentoria.

- O que a pessoa escreve vence o anúncio. Quem clicou no anúncio de paciente modelo e diz que quer
  ser aluna é da mentoria.
- Sem palavra-chave na mensagem, o anúncio vale como pista.
- As palavras de "como reconhecer" de cada oferta somam às que o sistema já conhece.
- Se a intenção ficar explícita no meio da conversa, o público muda.

## 7. O que sai da MD

- Preços, datas, cidades e vagas escritos à mão.
- O texto específico de Paciente Modelo e de Mentoria, e as extensões de campanha (como a da Black
  Estética): tudo isso agora é cadastro de oferta.
- Frases do tipo "se for anúncio de X, faça Y".
- Qualquer nome de pessoa, de consultório ou de cidade de uma conta específica.

## 8. O que continua na MD

Tom e humanização, venda consultiva, como lidar com objeções, como conduzir para a avaliação e o
agendamento, quando passar para uma pessoa, e o texto de "Como usar o bloco O que está valendo
agora" (abaixo).

## 9. Seção a incluir na MD

> **Como usar o bloco "O que está valendo agora"**
>
> O sistema entrega, a cada conversa, as ofertas abertas hoje. Use esse bloco como a única fonte
> de datas, vagas, preços da oferta, sinal e regras da edição.
>
> 1. O que a pessoa diz agora manda. O anúncio de origem é só uma pista; se ela pedir outra coisa,
>    siga o que ela pediu.
> 2. Se a mensagem for vaga (por exemplo, "vi o anúncio"), faça uma única pergunta para entender o
>    que ela quer, antes de oferecer qualquer coisa.
> 3. Cada oferta tem "para quem é" e "como reconhecer". Nunca ofereça uma oferta de profissionais a
>    um paciente, nem o contrário.
> 4. Só fale de uma oferta que esteja aberta. Se a do anúncio já encerrou ou esgotou, diga isso com
>    honestidade e apresente o que está valendo.
> 5. Siga as instruções comerciais da oferta, mas as regras de segurança, preço, confirmação de
>    pagamento e repasse ao humano valem sempre por cima.
> 6. Nunca invente data, vaga, preço ou condição que não esteja no bloco.

## 10. Restrições para a nova MD

- Só as quatro variáveis da seção 2.
- Nenhum preço em reais escrito como fato, nenhuma data ou vaga.
- Nenhum dado de uma conta específica (nome de pessoa, consultório ou cidade).
- Sem travessão e sem emoji.
- Não contradizer as regras fixas: preço antes de horário (a versão V5 permite o preço no mesmo
  turno), não inventar nada, não orientar clinicamente, não insistir depois de um "não", repasse
  ao humano quando for o caso, não repetir o que já foi dito.
- Não mencionar "paciente modelo" como campanha de preço: promoção de preço não vale para paciente
  modelo.

## 11. O que anexar na conversa com o editor

1. A MD atual: `docs/AGENTE_CORE_V5_1_UNIVERSAL.md`.
2. `docs/OFERTAS_PARA_A_MD.md`.
3. `docs/ORIENTACOES_AGENTE_CORE_V5_1.md`.
4. Este documento.

## 12. Prompt para colar no ChatGPT

> Preciso de uma nova versão da MD da minha assistente de atendimento (Agente Core V5.x), usando os
> quatro documentos anexos. Leia primeiro o BRIEFING_PARA_NOVA_MD, depois a MD atual.
>
> Faça assim:
>
> 1. Mantenha o cabeçalho "AGENTE CORE V5" e a estrutura da MD atual, preservando o tom, a
>    humanização, a venda consultiva e o tratamento de objeções.
> 2. Remova da MD qualquer fato escrito à mão (preços, datas, vagas, cidades, nomes de pessoas ou de
>    consultórios) e todo o texto específico de Paciente Modelo, Mentoria e promoções, porque isso
>    agora vem do cadastro de Ofertas.
> 3. Inclua a seção "Como usar o bloco O que está valendo agora" do documento, adaptada ao estilo
>    da MD.
> 4. Use só as variáveis {{ASSISTENTE}}, {{CONSULTORIO}}, {{RESPONSAVEL}} e {{RESPONSAVEL_NOME}}.
> 5. Sem travessão e sem emoji.
> 6. Ao final, me entregue: (a) a MD completa, (b) uma lista do que removeu e por quê, e (c) uma
>    lista de qualquer ponto em que você ficou em dúvida se algo é fato do cadastro ou jeito de
>    conversar.
>
> Não invente regras novas: onde o briefing disser que o sistema decide, a MD só diz como conversar.
