# Instrucoes para o Codex

Ao concluir qualquer tarefa que altere codigo neste projeto:

1. Revise as mudancas com `git diff`.
2. Rode as verificacoes relevantes quando o ambiente permitir.
3. Faca `git add` somente nos arquivos relacionados a tarefa.
4. Faca um commit com uma mensagem curta e descritiva.
5. Tente enviar as mudancas com `git push origin main`, ou para a branch correta se a tarefa estiver em outra branch.

Se o `git push` falhar por credenciais ou permissao, informe o bloqueio claramente e deixe o commit local pronto para envio manual.

Este projeto esta conectado ao Lovable via GitHub. Quando o push para o GitHub e concluido, o Lovable e atualizado automaticamente.

## Layout responsivo

- Toda rota deve preservar a navegacao principal: sidebar fixa a esquerda no desktop e menu flutuante em formato de ilha no mobile.
- Estados de erro e pagina nao encontrada devem usar `ResponsiveRouteState` para manter esse comportamento.
