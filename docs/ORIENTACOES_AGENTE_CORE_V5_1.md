# Orientações de integração — AGENTE CORE V5.1 UNIVERSAL

## Objetivo

Integrar a MD `AGENTE_CORE_V5_1_UNIVERSAL.md` ao CRM em ambiente de teste, sem modificar a lógica de outras contas, sem sobrescrever silenciosamente o manual anterior e sem push/deploy antes de autorização expressa. Esta V5.1 nasce da V5.0 e da V4.2; preserva segurança clínica, regras comerciais e recovery, mas aprimora o julgamento de cada turno.

## Regras que exigem inspeção especial

1. A **primeira mensagem de preço** deve conter apresentação breve, eventual micropergunta e o **valor dentro do mesmo turno/lote**. Nunca esperar que a pessoa responda à pergunta para só depois disparar o preço. Uma resposta com várias bolhas é um turno.
2. Não confundir `{{ASSISTENTE}}`, `{{CONSULTORIO}}`, `{{RESPONSAVEL}}` e `{{RESPONSAVEL_NOME}}` com valores fixos. Verificar o resolvedor real, o artigo de responsável e o fallback seguro.
3. Preços, unidades, campanhas, políticas e horários vêm dos cadastros atuais do CRM, não de variáveis de texto ou valores de exemplos.
4. Emissão de bolhas: permitir uma pergunta em bolha própria quando útil, sem obrigar três mensagens por turno.
5. Não presumir que envio de mídia, consulta à agenda, pagamento, encaminhamento humano ou recovery existe somente porque está descrito na MD.
6. Handoff humano precisa pausar IA e follow-ups imediatamente e de modo idempotente.
7. Áudio transcrito, texto truncado e foto não acessível precisam de respostas honestas e estratégia de reparo.
8. Recovery: não preservar automaticamente a cadência histórica agressiva; medir bloqueios, opt-out e reclamações antes de aumentar intensidade. Só código/scheduler controla intervalos.
9. Módulo Paciente Modelo HOF segue especializado; a Core deve ficar neutra e não citar próxima cidade/turma por conta própria.
10. Preservar a V5.0 e a V4.2 para reversão e auditoria.

## Etapas de integração

**Etapa 1 — Auditoria estática**

- Identificar qual versão está ativa em produção e teste.
- Auditar a ordem de montagem do prompt (sistema, regras fixas, dados da conta, Core, módulos, memória e ferramentas).
- Comparar todas as instruções conflitantes, principalmente preço primeiro turno, emojis, perguntas, repetição de cidade e follow-ups.
- Validar placeholders suportados e denunciar placeholders desconhecidos na UI antes de salvar.

**Etapa 2 — Simulações**

- Executar os 60 testes da seção F14 + cenários de regressão anteriores.
- Comparar saídas reais de V5.0 e V5.1 com os mesmos dados e ferramentas simulados.
- Registrar as mensagens efetivamente enviadas, não apenas texto planejado.
- Avaliar com a rubrica F15 e divulgar resultados com evidências.

**Etapa 3 — Homologação operacional**

- Testar com NÓS e pelo menos dois consultórios fictícios com nomes, serviços e políticas diferentes.
- Testar responsável feminino, masculino, “a equipe”, empresa com unidades múltiplas e dados ausentes.
- Confirmar preço no primeiro lote com envio de três bolhas, estado e fila em ordem.
- Checar conversas com equipe já assumida, mídia falha, agenda sem vaga e pagamento pendente.

**Etapa 4 — Relatório antes de ativar**

Apresentar: arquivos alterados, mudanças em fluxos, prompts resolvidos de exemplo sem dados sensíveis, resultados de testes, limitações reais, riscos, diferenças de comportamento e plano de rollback. **Não fazer push, deploy nem alterar produção sem aprovação.**

## Critérios de aceite críticos

- Nenhum preço conhecido fica retido por uma micropergunta na primeira resposta.
- Nenhum placeholder desconhecido é enviado ao paciente.
- Nenhuma pergunta de cidade redundante quando o local já foi informado ou oferta tem unidade única.
- Nenhuma mensagem “anotei” encerrando atendimento que poderia evoluir com informação útil.
- Nenhuma mídia declarada enviada sem entrega real ou tentativa confirmada.
- Nenhum agendamento ou pagamento confirmado sem evento real do backend.
- Nenhum contato automático após opt-out ou handoff.
- Nenhuma informação entre tenants.
- Sem emojis sistemáticos nem repetição automática de “Claro!”, “Ah, entendi” ou “Compreendi”.

## Informação importante

A MD é um contrato de comportamento, não uma implementação de ações. Se o CRM não fornece o dado ou ferramenta necessários, a IA deve declarar a limitação específica sem inventar; o Claude deve indicar a lacuna de backend separadamente, sem mascará-la com regras de texto.
