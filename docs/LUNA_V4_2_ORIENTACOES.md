# Orientação de implantação — LUNA V4.2

## Contexto

A `LUNA_V4_2.md` é a versão integral e consolidada da V4.1. Não é substituição resumida nem um patch isolado. Preserve no CRM as regras, ferramentas e dados já conectados (catálogo, unidade, especialidade, agenda, paciente modelo e Recovery Engine).

## Objetivo da V4.2

1. Tornar a linguagem conversacional mais natural, sem vícios repetitivos como “rapidinho”, “perfeito” e “por aqui”.
2. Permitir **bolhas de WhatsApp** com divisão semântica: tipicamente uma a três no mesmo turno, quatro somente quando faz sentido; uma única bolha continua correta.
3. Usar apresentação comercial **progressiva**: modalidade pedida primeiro, combo quando é o interesse, comparação apenas se solicitada.
4. Em leads com intenção forte de agendar, manter primeira resposta sem preço, identificar procedimento se necessário, apresentar referência comercial autorizada antes de oferecer horários reais. Não alongar a qualificação.
5. Distinguir “vou avaliar” de uma objeção explícita; não pressionar quem pede tempo.
6. Usar três modalidades de clareamento (consultório, caseiro, combinado) e o combo como oferta comercial independente. Verificar valores e inclusões no catálogo, sem hardcode histórico.

## Passos de auditoria técnica antes de habilitar bolhas reais

- Identificar como hoje a Luna gera texto e como o sistema divide uma resposta em mensagens.
- Verificar se existe suporte a lote de bolhas ordenadas; se não existir, propor uma implementação mínima reaproveitando o transporte atual.
- Uma resposta com duas ou três bolhas deve continuar sendo **um turno**, sem chamadas concorrentes independentes do modelo.
- Não dividir preço, valor de parcela, data, horário, endereço ou orientação clínica no meio.
- Não produzir várias notificações quando uma mensagem curta basta.
- Não iniciar follow-up até o final do lote. Se o paciente responder no meio, interromper/reavaliar o restante.
- Idempotência por turno e mensagem; registrar erros e cancelamentos.
- Se o backend não suportar bolhas múltiplas, usar texto único com parágrafos, sem exibir marcadores `Bolha 1` etc.

## Não alterar

- Estrutura e cadências operacionais atuais do Recovery Engine sem pedido específico; os horários são definidos pelo scheduler configurado, não pela MD.
- Fonte de preços e condições comerciais; utilizar catálogo vigente.
- Protocolos e FAQ clínica sem aprovação da Dra. Mariane.
- Fluxos de agendamento, reserva de paciente modelo, localização entre unidades e leitura de especialidades.
- Regras de consentimento, privacidade, urgência, handoff e bloqueios de comunicação.

## Testar

Executar cenários T01–T66 da MD com dados simulados, incluindo os casos de Camily, Leilane, Isa e Vic. Validar não apenas o texto, mas o comportamento técnico: organização das bolhas, valores antes de horários no lead decidido, cancelamento de lote, uso correto de fonte de dados e nenhuma regressão nas integrações. Não publicar em produção sem aprovação.
