# Acompanhar o disparo desde o enfileiramento, com erro e retentativa

Hoje o cartão só aparece na lista depois que o servidor devolve o id do disparo. Entre confirmar e isso acontecer existe um período cego (vínculo dos contatos no CRM + criação da fila), que pode levar dezenas de segundos e, se falhar, só vira um toast vermelho que some. É isso que muda.

## O que passa a aparecer na lista

1. **Cartão em preparação (na hora do clique)**
   Assim que a pessoa confirma, um cartão entra no topo de "Disparos enviados" com o nome dado ao disparo e a etapa corrente:
   - "Vinculando contatos ao CRM" — com contador (ex.: 120 de 200 vinculados) e barra proporcional;
   - "Criando a fila";
   - some quando o disparo real chega na lista (mesmo id), sem piscar.

2. **Cartão de falha (se o enfileiramento quebrar)**
   O cartão fica na lista em vermelho, com a mensagem de erro exata devolvida pelo servidor, quantos contatos estavam na seleção e dois botões: **Tentar novamente** (refaz o mesmo envio com a mesma mensagem, ritmo, mídia e seleção) e **Descartar**. Sobrevive a recarregar a página e a trocar de tela (guardado no navegador), porque o erro típico aqui é timeout do CRM e a pessoa costuma sair da tela.

3. **Detalhe dos disparos já criados**
   O cartão existente ganha um "Ver detalhes" que abre:
   - a contagem por situação (enviados / na fila / falharam) e a mensagem de erro registrada em cada destinatário que falhou, com nome e telefone;
   - botão **Reenviar aos que falharam**, que cria um novo disparo com a mesma mensagem apenas para esses contatos.

## Detalhes técnicos

- **Etapas do enfileiramento**: hoje `criarDisparo` faz vínculo em lote e criação da fila numa chamada só. Divide-se em duas server functions (`vincularAlvos` e `criarDisparo` recebendo já os alvos resolvidos) para que a tela saiba em qual etapa está; o vínculo é feito em blocos (ex.: 50 contatos) para o percentual andar de verdade.
- **Estado do enfileiramento**: um pequeno store no cliente (contexto + `sessionStorage`) guarda `{ id local, nome, mensagem, ritmo, mediaPath, alvos, etapa, progresso, erro }`. `NewCampaignSheet` publica nele em vez de rodar a mutação isolada; a página de Campanhas renderiza esses itens acima da lista vinda do servidor.
- **Retentativa**: reexecuta o mesmo fluxo a partir do payload salvo; contatos já vinculados na tentativa anterior são reaproveitados.
- **Falhas por destinatário**: nova server function lê `whatsapp_broadcast_targets` (status `failed`, com `error` e `media_skipped_reason`) filtrada por `owner_id`; o reenvio usa `criarDisparo` com esses `contact_id`.
- Nada muda nas Edge Functions nem no banco.
