# Orientações ao Claude Code — AGENTE CORE V5.4 / Motor de Recuperação V2

## Objetivo

Integrar e homologar a `AGENTE_CORE_V5_4_UNIVERSAL_MOTOR_RECUPERACAO_V2.md` como nova Core Universal candidata, SEM aplicar migração, alterar produção, ligar automações, emitir follow-ups, enviar mensagens a pacientes ou fazer deploy sem aprovação explícita. A MD V5.3 continua como rollback.

## Mudança conceitual

A antiga Parte D do Recovery Engine foi substituída pelo **Motor de Recuperação V2**. A Core agora deve decidir se uma retomada é pertinente, verificar o histórico, reconhecer incertezas e falhas do próprio atendimento, escolher uma estratégia legítima e produzir comunicação contextual, respeitando o vínculo. O ato de decidir `NO_MESSAGE` ou sugerir ação humana é intencional. Partes F9 e G14 da MD foram atualizadas para não replicar trilhas e cadências concorrentes. A Parte I fornece testes e métricas.

A mudança foi inspirada por dados de uma única conta e insights de reunião. Não incluir nomes de pacientes, diálogos integrais ou dados da conta NÓS no prompt universal, no repositório público, nos logs analíticos ou no treinamento de outras empresas.

## Verificações de engenharia antes de qualquer modificação

1. Localizar arquivo ativo da MD e pontos reais de montagem do prompt, incluindo rota de atendimento principal, processamento de follow-up, mensagens recebidas em rajada e mensagens ao vivo. Registrar precedência de sistema, desenvolvedor, ofertas e segurança.
2. Verificar que quatro variáveis `{{ASSISTENTE}}`, `{{CONSULTORIO}}`, `{{RESPONSAVEL}}`, `{{RESPONSAVEL_NOME}}` continuam resolvidas corretamente. O nome Nágila é um dado específico da conta, **não** constante da MD.
3. Verificar que status de Oferta, preços, condições de pagamento, público, unidade e histórico são carregados da conta atual e isolados por tenant. Não reaproveitar ofertas vencidas ou de outra conta.
4. Inspecionar scheduler atual, configurações reais, canal, templates, janela de 24h, cooldown, limites e mecanismos de cancelamento de recuperação. Não presumir que a MD configura horários nem que recursos informados como commits locais já foram publicados.
5. Inspecionar atomicidade de cancelamento após mensagem do contato, takeover humano, confirmação de agendamento, pagamento validado, opt-out e alteração de oferta. Proteger contra jobs concorrentes e mensagens já enfileiradas.
6. Conferir fontes para eventos de agenda e de pagamento: agendamento só é confirmado por sistema; reserva paga só por transação conciliada; vaga recém-aberta só quando evento verificável.
7. Inspecionar biblioteca de mídias e ferramentas de envio. A Core pode sugerir vídeo/áudio humano; não afirmar que profissional gravou ou que tarefa foi criada se tal endpoint não existe.
8. Conferir privacidade: não inserir conteúdo clínico sensível ou dados pessoais desnecessários em mensagens que aparecem em notificações e não levar dados completos a analytics.

## Implementação sugerida, sujeita a compatibilidade

**Não inventar ações.** Os enums e campos da seção D14 são **propostas de contrato** e não descrições de APIs existentes. Verificar o schema real antes de implementar ou mapear.

1. Na etapa anterior ao envio, obter snapshot atual de conversa, estado comercial e status de consentimento. Executar guardrails determinísticos de bloqueio no backend.
2. Fornecer ao modelo histórico pertinente e fontes atuais; o motor decide estratégia/contexto sem alterar limites determinísticos.
3. Tipificar a decisão (`SEND_TEXT`, `NO_MESSAGE`, `PAUSE`, `STOP`, `HUMAN_SUGGESTION`, `TOOL_REQUIRED`) apenas se o fluxo atual tiver suporte; do contrário, adaptar sem prometer execução.
4. Revalidar o estado antes de enviar e criar chave idempotente por pessoa/negócio/finalidade/tentativa. Cancelar job se houve resposta ou takeover.
5. Registrar estratégia, evidência e saída efetiva. Não medir mensagem apenas gerada como enviada nem considerar mensagem “Oi” automaticamente como recuperação comercial útil.
6. Quando houver resposta, voltar ao modo atendimento normal e cancelar a recuperação anterior; evitar saudação repetida, questionários e perguntas já respondidas.
7. `HUMAN_SUGGESTION`: registrar recomendação, criar tarefa real **somente** se ferramenta habilitada; não simular áudio/vídeo humano.
8. Mantenha opção de desligar/rollback por tenant sem alterar código universal ou perder os dados de histórico.

## Compatibilidade com experiências anteriores

Não degradar: apresentação breve, qualificação consultiva quando pertinente, escuta ativa, preço informado no mesmo lote quando solicitado e conhecido, explicação de modalidades somente após atender ao interesse original, reação à resposta do cliente, oferta correta, regra dos dois horários reais, avaliação clínica e política de pagamento sem invenções. Recuperação não substitui atendimento ao vivo e não adiciona espera obrigatória à intenção clara de agendamento.

## Leitura correta dos dados de estudo

O relatório `retomadas-ultimos-30-dias.md` declara 151 retomadas, 28 respostas em 48h, 19 conversas e um agendamento identificado após o retorno. A tabela por mecanismo soma **151 mensagens e 19 respostas atribuídas**. Antes de usar como KPI, diagnosticar se a divergência decorre de múltiplas respostas na mesma conversa, deduplicação, unidade de análise ou atribuição. Não consertar silenciosamente. A atribuição à última tentativa não prova causalidade. Não tratar `OBJECTION_ISOLATION` 2/6 como estratégia comprovadamente superior; não tratar despedida como técnica vencedora pelo número absoluto de respostas.

## Testes obrigatórios

- Executar os 75 testes `MR2-001` a `MR2-075` da Parte I, preferencialmente de forma automatizada com fixtures anonimizadas.
- Executar novamente regressões V5.1, V5.2 e V5.3 para atendimento, preço, mídia, agenda, pagamentos, limites clínicos, ofertas e isolamento multiempresa.
- Realizar avaliação offline contra mensagens históricas anonimizadas: a melhoria esperada é pertinência e redução de mensagens de cobrança vazia, não aumento artificial de respostas.
- Preparar shadow mode que gere decisões sem envios e registre casos de `NO_MESSAGE` como decisões válidas.
- Auditar opt-outs, reclamações, retorno espontâneo, tomadas humanas, edição/campanha errada, anexos não autorizados e duplicidade de jobs.
- A/B opcional com grupo comparável e métricas de agendamento confirmado, comparecimento e reclamações. Uma variável por ciclo.

## Critérios de aceite

1. Nenhuma mensagem enviada após opt-out, resposta, takeover, conversão confirmada, pausa relevante ou oferta vencida.
2. Nenhuma alegação de preço, horário, escassez, pagamento, benefício ou vídeo sem evidência verificável.
3. Nenhuma intimidade simulada, frase de cobrança genérica repetida ou uso indiscriminado de nomes/apelidos.
4. Nenhuma conversão contabilizada por mensagem textual de “agendado” sem confirmação no sistema.
5. Métricas com denominadores explícitos: contatos elegíveis, mensagens enviadas, respostas úteis, conversas reabertas, agendamentos, comparecimento e vendas.
6. A equipe consegue revisar a estratégia escolhida e a razão de envio/supressão sem acessar dados excessivos do cliente.
7. Ficam prontos um diff da implementação, resultados de testes e roteiro de rollback, sem deploy até aprovação.

## Entregáveis esperados do Claude Code

- Diagnóstico do sistema atual, com nomes reais de módulos/rotas e lacunas de integração;
- lista de conflitos entre MD V5.4, prompts superiores e scheduler;
- plano de alterações de backend e/ou frontend, separando o que é obrigatório do que é opcional;
- resultado dos 75 testes novos e das regressões anteriores;
- plano de piloto por tenant, métricas instrumentadas e rollback;
- declaração clara do que permanece manual, incompleto ou não implementado.

**Nota final:** o Motor de Recuperação V2 é um sistema de decisão contextual, não um repositório de scripts. O backend continua dono de elegibilidade e envio, e a equipe humana continua sendo responsável por interações pessoais que o agente não pode executar de forma verdadeira.
