# Relatório de integração — Agente Core V5.1 (ambiente local)

Nada disto foi publicado, e nenhuma conta de produção foi alterada. A NÓS segue com a V4.2.

## O que foi feito

| Arquivo | Mudança |
|---|---|
| `docs/AGENTE_CORE_V5_1_UNIVERSAL.md` | A MD V5.1, guardada ao lado da V4.2 (`docs/LUNA_V4_2.md`) para comparar e reverter |
| `docs/ORIENTACOES_AGENTE_CORE_V5_1.md` | As orientações recebidas |
| `_shared/variaveis-da-instrucao.ts` | Resolve `{{ASSISTENTE}}`, `{{CONSULTORIO}}`, `{{RESPONSAVEL}}`, `{{RESPONSAVEL_NOME}}` (feito antes); agora também `problemasDeVariaveis`, para a tela |
| `_shared/instrucao-do-agente.ts` | A regra fixa 8 (preço e horário) passou a depender da versão da MD: `versaoDoNucleo` |
| `ManualDaLuna.tsx` | Aviso na tela, antes de salvar, de variável desconhecida e de chave sem par |
| `scripts/agente/instalar-manual.mjs` | Troca o manual de UMA conta com cópia de segurança. Por padrão só simula; recusa texto com variável desconhecida |
| `tests/agente-core-v5-1.ts` | 34 checagens |

## O conflito encontrado (resolvido só para a V5.1)

A regra 8, **fixa no código**, dizia: primeira resposta sem preço, uma pergunta, esperar a resposta, só depois o valor, "preço e horário nunca na mesma mensagem". O contrato V5.1 manda o contrário: **pedido de preço não espera**; o valor sai no mesmo turno (item 1 das orientações). Como o código vence a MD, a V5.1 teria sido anulada em silêncio.

Solução: o código reconhece a V5 pelo cabeçalho da MD (`AGENTE CORE V5…`) e usa a regra 8 nova (valor no mesmo lote, horário só depois do valor, avaliação separada do valor). Qualquer outra MD, inclusive a V4.2 da NÓS, recebe a regra antiga **idêntica byte a byte** (conferido contra a versão anterior).

## Resultados dos testes

- Só as 4 variáveis suportadas aparecem na V5.1; nenhuma desconhecida nem chave solta.
- Resolvida para 4 consultórios (incluindo configuração vazia): nenhuma chave sobra, nenhum nome de uma conta aparece em outra, e o artigo do responsável nunca duplica.
- A V5.1 não tem preço em reais escrito como fato. Restam 5 menções a cidades da NÓS, todas em exemplos do que **não** perguntar.
- V5.1 reconhecida como V5; V4.2 e manual vazio como V4. Regra nova só na V5.1; regra antiga intacta na V4.2.
- Regras de repasse para humano continuam anexadas. Módulo Paciente Modelo HOF continua entrando com a Core V5.1.
- Validação geral do repositório (tipos, build, edge functions, todos os testes) passou.

## O que NÃO foi feito (e por quê)

- **Os 60 testes da F14 e a rubrica F15 não foram executados.** Eles pedem respostas reais de um modelo; o que foi testado é a montagem da instrução, não o comportamento do modelo.
- **A V5.1 não foi instalada em nenhuma conta**, nem na demo. Falta decidir onde testar primeiro.
- Comparação V5.0 × V5.1: a V5.0 não está no repositório.

## Achados e lacunas de backend (a MD não resolve sozinha)

1. **Tamanho.** A V5.1 tem ~125 mil caracteres e vai inteira em todo turno, inclusive as partes só para desenvolvedores (E8 testes, F12 casos de referência, F14 matriz, F15 rubrica, F16 checklist, E6). Isso custa tokens e arrisca o modelo imitar exemplos. Recomendo separar o runtime (partes A–D e F1–F11) da documentação de teste.
2. **Manual da NÓS no banco ≠ `docs/LUNA_V4_2.md`**: 129.753 contra 135.134 caracteres. Antes de trocar, vale guardar o do banco como a versão de referência.
3. **Áudio transcrito, texto truncado e foto inacessível:** não encontrei no caminho que responde ao paciente nenhuma transcrição de áudio. A MD manda ser honesto, mas o reparo depende de backend.
4. **Recovery:** a cadência é do código/scheduler e não mudou. A F9 pede cadência mais conservadora e medição de opt-out e bloqueios; isso é decisão de produto e de código, fora da MD.
5. **Mídia declarada enviada só com entrega real:** a biblioteca de casos já envia e registra; conferir o registro de falha de envio antes de ligar.
6. **Handoff e opt-out:** a equipe assumindo pausa a assistente e cancela o recovery (visto nas conversas reais); "pediu para parar" grava `nao_contatar_em`. Falta provar a idempotência com testes de corrida.
7. **Pergunta de cidade redundante:** a regra da cidade está no código (seção da cidade) e na MD; conferir com conversas reais.

## Plano de reversão

O manual anterior de uma conta é salvo em `scripts/agente/backups/` antes de qualquer troca (`instalar-manual.mjs --aplicar`), e restaurar é rodar o mesmo script apontando para a cópia. A V4.2 segue em `docs/LUNA_V4_2.md`.
