# Ofertas: o que muda para a MD da Luna

A Luna agora recebe, a cada conversa, um bloco chamado **"O que está valendo agora"**.
Ele é montado pelo sistema a partir de **Agente de IA > Ofertas**. Quando você muda
uma data, uma vaga, um preço ou o sinal, a próxima conversa já usa o valor novo, sem
editar a MD.

## As três camadas

| Camada        | O que é                                                                                         | Onde se cadastra              |
| ------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- |
| Procedimentos | O que a clínica faz, com o preço normal                                                         | Configurações > Procedimentos |
| **Ofertas**   | Algo especial, com destaque e regras próprias: Paciente Modelo, Mentoria, uma promoção de preço | Agente de IA > Ofertas        |
| Campanhas     | Os disparos e anúncios que levam as pessoas até a clínica                                       | Atendimentos > Campanhas      |

A tela que se chamava "Campanhas" em Configurações (a das promoções de preço) agora é
**Ofertas**, dentro do Agente de IA. "Campanhas" fica só para disparos e anúncios.

## O que cada oferta guarda

Cada oferta tem uma ficha em abas (Agente de IA > Ofertas > abrir a oferta): Visão geral,
Condições, Edições e vagas (Paciente Modelo), Conhecimento, Materiais, Instruções, Testar e
"O que a IA lê".

- Nome, período e situação (rascunho, em teste, ligada, encerrada).
- **Para quem é:** pacientes, profissionais ou qualquer pessoa.
- **Resumo curto:** uma ou duas frases do que é a oferta. Vai em TODA conversa.
- **Como reconhecer:** palavras e situações que indicam a oferta.
- **Conhecimento:** textos livres (o que é, quem aplica, perguntas frequentes, objeções,
  políticas), cada um com "quando usar". Entram só quando a conversa é sobre aquela oferta.
- **Materiais:** casos autorizados da biblioteca ligados à oferta (a foto só vai quando a conversa
  é sobre ela).
- Procedimentos e preços (promoção) ou edição com vagas, sinal e regras (Paciente Modelo).
- **Instruções comerciais:** como conduzir, em poucas linhas. Nunca valem mais que os dados
  cadastrados nem que as regras que a Luna não pode quebrar.

## A oferta em foco (novo)

- O bloco "O que está valendo agora" numera as ofertas (F1, F2…). Na resposta, a assistente
  devolve o campo **ofertaEmFoco** com o código da oferta de que a conversa trata. Vazio mantém;
  `NENHUMA` limpa.
- Com uma oferta em foco, o sistema acrescenta a seção **"Conhecimento sobre [oferta]"**, com os
  textos cadastrados. Sem foco, só o resumo vai no bloco.
- No primeiro turno, o sistema sugere o foco pelo "como reconhecer" (a mensagem da pessoa vence o
  anúncio; se mais de uma oferta combinar, não sugere). Dali em diante vale o que a assistente indicar.
- A MD não precisa conhecer os códigos: o bloco ensina como usar o campo. A MD só precisa dizer
  que ela deve consultar o conhecimento da oferta antes de responder sobre ela, e nunca inventar o
  que não está lá.

## Texto para colar na MD

Adicione esta seção à MD, por exemplo logo depois da parte que fala de preço:

> **Como usar o bloco "O que está valendo agora"**
>
> O sistema entrega, a cada conversa, as ofertas abertas hoje. Use esse bloco como a única fonte
> de datas, vagas, preços da oferta, sinal e regras da edição.
>
> 1. O que a pessoa diz agora manda. O anúncio de origem é só uma pista; se ela pedir outra coisa,
>    siga o que ela pediu.
> 2. Se a mensagem for vaga (por exemplo, "vi o anúncio"), faça uma única pergunta para entender
>    o que ela quer, antes de oferecer qualquer coisa.
> 3. Cada oferta tem "para quem é" e "como reconhecer". Nunca ofereça uma oferta de profissionais
>    a um paciente, nem o contrário.
> 4. Só fale de uma oferta que esteja aberta. Se a do anúncio já encerrou ou esgotou, diga isso
>    com honestidade e apresente o que está valendo.
> 5. Siga as instruções comerciais da oferta, mas as regras de segurança, preço, confirmação de
>    pagamento e repasse ao humano valem sempre por cima.
> 6. Nunca invente data, vaga, preço ou condição que não esteja no bloco.

O sistema já escreve essas mesmas regras no fim do bloco, então a MD só precisa reforçar o jeito
de conversar. Se a MD e o bloco divergirem, vale o bloco (dado cadastrado).

## O que tirar da MD

- Preços, datas, cidades e vagas escritos à mão.
- O texto específico de Paciente Modelo e Mentoria, e a extensão da Black Estética, que passam
  para o cadastro de cada oferta.
- Frases do tipo "se for anúncio de X, faça Y": isso agora é cadastro (para quem é e como reconhecer).

## Como o sistema decide o público

1. O que a pessoa escreveu vence o anúncio. Quem clicou no anúncio de paciente modelo e escreve
   "quero ser aluna da mentoria" vai para a mentoria.
2. Sem nenhuma palavra-chave na mensagem, vale o anúncio como pista.
3. As palavras de "Como reconhecer" de cada oferta somam às palavras que o sistema já conhece.
4. Se a pessoa deixar clara a intenção durante a conversa, o público muda (como já era).

## Ordem em que a Luna lê (a de baixo vence)

1. Abertura e MD (como atender).
2. Anúncio de origem (pista), cidade, unidades, equipe, tabela de preços, condições.
3. **O que está valendo agora** (novo).
4. Horários e, quando a conversa é de paciente modelo, a seção própria dele.
5. As regras que a Luna nunca pode quebrar.
