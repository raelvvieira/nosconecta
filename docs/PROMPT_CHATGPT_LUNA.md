# Prompt para o ChatGPT (onde a MD da Luna é escrita)

Cole este texto numa conversa nova e anexe `LUNA_V4_2.md` (e, se quiser, `LUNA_CAMPOS_PERSONALIZADOS.md`).

---

Você vai me ajudar a reestruturar o manual (MD) de uma assistente de WhatsApp chamada Luna. Leia o contexto inteiro antes de responder.

## O produto
O NÓS Conecta é um sistema para clínicas (odontologia e estética). Cada consultório cliente tem sua própria conta, com seus dados isolados: agenda, pacientes, WhatsApp conectado, equipe, preços. A Luna é a assistente de IA que responde pacientes no WhatsApp: acolhe, explica, qualifica, apresenta valores e marca avaliação. Hoje só a NÓS (clínica da Dra. Mariane) usa; vamos vender para outros consultórios, cada um com outro nome de assistente, outra equipe, outra cidade e outros preços.

## Como a instrução que a Luna recebe é montada
O sistema monta a instrução a cada resposta, nesta ordem:
1. "Você atende pacientes por WhatsApp em nome de {consultório}."
2. **A MD** (o arquivo que vou te mandar), **inserida exatamente como está escrita, sem substituir nenhuma variável**.
3. Seções que o SISTEMA escreve sozinho, a partir do cadastro da conta: de onde o paciente veio (anúncio); cidade e unidades com endereço, mapa e como chegar; quem atende (profissionais e especialidades); tabela de preços e parcelamento; condições (formas de pagamento, parcelas, juros, avaliação gratuita ou paga, política de falta e de cancelamento); campanhas válidas hoje; horários reais livres da agenda; módulo de paciente modelo/mentoria (só quando ligado); biblioteca de casos de antes e depois; dúvida encaminhada.
4. Regras invioláveis fixas no código: quando passar para um humano (dor, urgência, reclamação, pedido de pessoa), nunca inventar dado, nunca orientação clínica, nunca prometer prazo/desconto, valor antes de horário, não repetir o que já disse, sem travessão, emoji raro, não se declarar IA a menos que perguntem. **Onde a MD divergir dessas regras, vale o código.**

## O problema
A MD atual (LUNA V4.2) foi escrita só para a NÓS. Tem escrito dentro dela: o nome "Luna" (85 vezes), "Dra. Mariane" (75), as cidades Florianópolis e Porto Alegre (27), valores como "R$ 399" (28), o combo limpeza + clareamento, a campanha Black Estética de nov/2026, a mentoria/paciente modelo e um anexo com fatos do sistema da NÓS (parcelamento em 12x). Para outro consultório isso é erro: a assistente se chamaria Luna, falaria da Dra. Mariane e citaria cidades e preços que não são dele.

## O que quero
Transformar a MD em duas peças:
1. **NÚCLEO neutro**, que serve para qualquer consultório: método de atendimento, tom, abertura, descoberta, venda consultiva, objeções, agendamento, quando não responder, FAQ clínica educativa, urgência, lógica do Recovery (sem horários; quem decide quando é o motor do sistema). Sem nenhum nome próprio, cidade, valor ou oferta escritos.
2. **EXTENSÃO NÓS**, só com o que é específico da NÓS (combo, Black Estética, mentoria, exemplos com nomes reais, casos de teste), para ficar na conta da NÓS e não vazar para outras.

## Convenções que o núcleo deve seguir
- Variáveis que o sistema vai trocar antes de enviar: `{{ASSISTENTE}}` (nome da assistente), `{{CONSULTORIO}}` (nome do consultório), `{{RESPONSAVEL}}` (quem faz a avaliação, já com artigo: "a Dra. Mariane", "o Dr. Paulo" ou "a equipe"), `{{RESPONSAVEL_NOME}}` (sem artigo). Não invente outras sem me perguntar.
- Preço, cidade, endereço, horário, forma de pagamento e especialidade **não têm variável**: a MD deve mandar usar "a seção de preços / de unidades / de horários / de condições desta instrução", porque o sistema já escreve essas seções. Nunca repita o dado na MD.
- Exemplos de fala usam variável ou colchete de campo dinâmico, por exemplo `[PREÇO DA TABELA]`, `[UNIDADE CONFIRMADA]`, `[HORÁRIO 1]`. Nunca um valor ou nome real.
- Cada consultório pode ter só odontologia, só estética ou as duas: o núcleo não deve assumir procedimentos específicos.

## Restrições
- Não enfraqueça nenhuma regra de segurança, urgência, repasse para humano, privacidade ou fatualidade.
- Não remova a lógica comercial que já funciona (primeira resposta sem preço, valor antes de horário, dois horários, anti-loop, bolhas).
- Onde a MD repete o que o código já garante, proponha **remover** (menos texto = menos conflito), me mostrando o trecho.
- Mantenha português do Brasil, o tom natural e curto, e a estrutura de partes A–E.
- Não invente funcionalidades: a Luna não chama ferramentas, só escreve a resposta; horários e preços chegam prontos nas seções do sistema.

## Como quero que você trabalhe (em etapas, uma por vez, esperando meu OK)
1. **Inventário.** Liste, por seção da MD (A1…E14 e o Anexo S), tudo que é específico da NÓS: o trecho curto, o motivo e a correção proposta (variável, colchete, remover, mover para a Extensão NÓS ou virar campanha/módulo). Em tabela.
2. **Conflitos.** Aponte trechos da MD que repetem ou contradizem as regras fixas do código listadas acima, e trechos que repetem dados que o sistema já injeta.
3. **Proposta de estrutura** do núcleo e da extensão (índice), para eu aprovar antes de escrever.
4. **Reescrita**, parte por parte (A, depois B…), marcando o que mudou. Só comece depois que eu aprovar as etapas 1 a 3.
5. **Casos de teste** novos e neutros (com variáveis), mais uma lista curta de testes que provem que a Extensão NÓS não vaza para outra conta.

Se algo estiver ambíguo, pergunte antes de decidir. Comece pela etapa 1.
