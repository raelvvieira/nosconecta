# Orientações para Claude Code — homologação da AGENTE CORE V5.2 UNIVERSAL

**Objetivo:** integrar a nova MD em ambiente de teste, compatível com a camada de Ofertas, preservando a inteligência de venda e os mecanismos da V5.1. **Não fazer push, deploy, migration no banco produtivo, alteração da NÓS, nem publicação sem autorização expressa.**

## Materiais

1. `AGENTE_CORE_V5_2_UNIVERSAL.md` — novo manual completo, Parte G: Motor Universal de Ofertas.
2. `AGENTE_CORE_V5_1_UNIVERSAL.md` — baseline de comparação e rollback.
3. `docs/OFERTAS_PARA_A_MD.md` — contrato específico já produzido no repositório, se existente.
4. Implementação das Ofertas, commit local informado `7a04e30` — verificar o estado real do repositório, não assumir que já foi publicada.
5. Implementação das variáveis de identidade, commit `13bc199` — verificar as quatro chaves suportadas.
6. Antiga `LUNA_MODULO_PACIENTE_MODELO_HOF_V2.md` — **somente para extrair conteúdos específicos** de FAQ, supervisão, políticas, prova e regras de reserva; não anexar junto à Core como segundo motor comercial.

## Tarefa 1. Auditar o contrato real

Ler o código que monta a instrução e documentar exatamente:

- ordem e prioridade de blocos enviados ao modelo;
- esquema da nova tabela de Ofertas, filtro de status, pronto/rascunho e público;
- nome e conteúdo real do bloco “O que está valendo agora”;
- como se interpreta anúncio de origem, `Como reconhecer`, `Para quem é` e mudança de intenção;
- diferença entre catálogo regular e preços especiais;
- comportamento do fallback legado quando a migration não foi aplicada;
- como a chave do módulo Paciente Modelo interfere na elegibilidade da Oferta;
- quais ferramentas **realmente existem** para detalhamento, mídias, agenda, retenção de vaga, pagamento e confirmação;
- como o Recovery Engine captura a Oferta, revalida vigência e pausa quando humano assume;
- se o bloco de Ofertas traz resumo ou detalhes suficientes (preço, composição, ml, condições, sinal, prática, local, datas, mídias).

Não inventar nomes de endpoints nem informar funcionalidades hipotéticas como implementadas.

## Tarefa 2. Validar a MD

1. Reconciliar a V5.2 com instruções imutáveis no código. Segurança e verdade prevalecem.
2. Aplicar o texto integral de V5.2 à configuração **de teste**, sem resumir ou adaptar silenciosamente.
3. Conferir interpolação de `{{ASSISTENTE}}`, `{{CONSULTORIO}}`, `{{RESPONSAVEL}}` e `{{RESPONSAVEL_NOME}}` em pelo menos três contas fictícias; não usar variáveis novas.
4. Confirmar que a identidade do agente vem da conta e que o campo Instruções Comerciais não pode alterar segurança/personalidade.
5. Não inserir preços, datas, unidades, profissionais e links da NÓS dentro da Core.
6. Verificar que o agente não recebe simultaneamente duas MDs comerciais, uma da Core e outra do Paciente Modelo.
7. Não perder regras de V5.1: oralidade, perguntas curtas, comentários relevantes, preço no mesmo lote quando conhecido, emoji raro, memória, reparo, correção, reclamação, mídias, agendamento e recovery.

## Tarefa 3. Testes instrumentados

Executar os 75 testes da Parte G e os testes ainda pertinentes da V5.1, com logs efetivos de mensagem enviada, ferramentas e dados do contexto. Priorizar os cenários críticos:

- anúncio de paciente modelo e mensagem “quero ser aluno”;
- oferta datada com uma única edição em cidade determinada;
- `Quanto custa?` no primeiro contato: acolher, microperguntar opcionalmente, entregar valor no mesmo lote;
- uma pessoa que diz “só preço”: responder diretamente;
- preferência por atendimento particular, com preço regular, não o da oferta;
- rascunho, esgotada, encerrada, não pronta ou recurso desativado;
- lacuna de dados (ml, prazo, cidade, endereço, abatimento do sinal);
- preço regular diferente do promocional;
- agenda sem slots reais: não inventar;
- mensagem “já paguei”: não confirmar reserva sem conciliação e registro;
- prova social não autorizada ou mídia prometida mas não enviada;
- mensagens em rajada, troca de intenção e humano assumindo;
- recuperação após oferta encerrada, opt-out ou reserva confirmada;
- duas contas intercaladas, sem vazamento.

**Critério crítico:** reprovação automática por preço ou condição inventados, confirmação falsa de vaga/pagamento, mídia sem autorização, vazamento de dados, venda de paciente-modelo como formação profissional ou violação de opt-out.

## Tarefa 4. Migração de conteúdo, separada da implementação da Core

Preparar um inventário do conteúdo útil da antiga MD de Paciente Modelo, com destino proposto:

| Conteúdo anterior | Destino novo |
|---|---|
| Datas, locais, edição | Cadastro vigente de Oferta |
| Valores, pacotes, ml | Procedimentos vinculados e condições de Oferta |
| Quem aplica e quem supervisiona | Descrição e FAQ aprovadas da Oferta |
| Perfis e cases | Profissionais / materiais autorizados |
| Sinal, reembolso, link | Regras de reserva e pagamento da Oferta |
| Objeções específicas | FAQ e instruções comerciais da Oferta |
| Conversação geral e SPIN | Core V5.2, sem segunda MD |
| Recuperação por estágio | Recovery Engine universal, com referência à Oferta |

**Não desativar o módulo antigo, remover extensões da NÓS ou apagar conteúdos antes de backup e validação funcional.** O cadastro da Mentoria para Profissionais pode ainda ser incompleto; registrar lacunas, não criar valores ou datas.

## Tarefa 5. Entrega do diagnóstico antes de ativação

Produzir um relatório com:

1. Inventário de arquivos, funções, tabelas e ferramentas tocadas/consultadas.
2. Campos reais disponíveis no bloco e campos que faltam.
3. Diferenças entre Core V5.1 e V5.2, com regressões encontradas.
4. Resultado das simulações com mensagens, dados de entrada e ferramenta usada.
5. Riscos financeiros, clínicos e de campanha.
6. Caminho de migração e rollback.
7. Lista exata do que requer implementação adicional, sem prometer que texto na MD resolve código ausente.

**Publicação somente após autorização expressa do usuário.**
