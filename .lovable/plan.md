# Corrigir "ReferenceError: body is not defined" no disparo

## O que está acontecendo

O erro não vem do app. Ele vem da função de servidor `crm-contacts`, que é chamada para vincular os contatos ao CRM antes de montar a fila do disparo.

O rastro confirma: `resolverEmLote` (no app) chamou `crm-contacts`, recebeu uma resposta de erro `500` com o texto `ReferenceError: body is not defined` e só repassou essa mensagem para a tela.

O código no repositório já está correto — ele lê a requisição com `const { ownerId, action, patients, ... } = await req.json()`, sem nenhum `body`. A versão que está **publicada** é antiga e ainda usa `body.patients`, um nome que nunca foi declarado ali. Por isso o disparo quebra exatamente no passo de vincular contatos novos.

## Correção

- Publicar novamente a função `crm-contacts` a partir do código atual do repositório (sem alterar código, sem migrations).
- Depois do deploy, chamar a função com uma carga de teste `resolve-batch` para confirmar que ela responde sem o `ReferenceError`.

## Melhoria opcional (posso incluir se quiser)

Hoje, quando a função de servidor devolve um erro cru, ele aparece na tela como texto técnico. Posso fazer o app traduzir respostas `500` de `crm-contacts` para uma mensagem clara do tipo "não foi possível vincular os contatos ao CRM — tente novamente", mantendo o detalhe técnico só no log.
