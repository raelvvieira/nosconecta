## O que está acontecendo

A mensagem **"Preview has not been built yet. Either your project has an error or the preview is currently being built"** aparece quando o Lovable recebe um commit (vindo do GitHub/Claude) mas o build do preview ainda não terminou — ou falhou. Ou seja: o problema não é o "commit" em si, é o que esse commit contém.

No seu projeto, o build atual passa apenas com warnings (todos de `inputValidator()` deprecated, nenhum erro). Então, na maioria das vezes, basta aguardar 30–90s após o commit. Quando demora muito ou nunca aparece, é porque alguma alteração quebrou o build.

## Checklist a rodar no Claude antes de commitar

### 1. Rodar o build localmente
Antes de cada commit, no terminal do Claude:
```bash
bun run build
```
Se terminar com `✓ built in ...s` sem `error`, o preview do Lovable também vai buildar. Se aparecer `error during build`, **não commite** — corrija primeiro.

### 2. Rodar o typecheck
```bash
bunx tsc --noEmit
```
Esse projeto usa `strict: true`. Qualquer import que não resolve, prop faltante ou tipo errado derruba o build do Lovable mesmo que rode no `vite dev`.

### 3. Regras específicas deste projeto (TanStack Start)
Coisas que silenciosamente quebram o preview:

- **Não criar pasta `src/pages/`** — TanStack Start usa só `src/routes/`. Misturar as duas convenções gera rota duplicada `/`.
- **Não editar `src/routeTree.gen.ts`** — é auto-gerado. Apague-o se conflitar; o Vite regenera.
- **Não editar `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `types.ts`** nem o `.env` com `VITE_SUPABASE_*` — são gerados pelo Lovable Cloud.
- **Toda rota com `loader` precisa de `errorComponent` e `notFoundComponent`**, e a root precisa de `notFoundComponent`. Faltando isso o build até passa, mas erros em runtime viram 500 sem stack.
- **Não chamar server function com `requireSupabaseAuth` de `loader` de rota pública** — o prerender do `build:dev` roda sem sessão e falha com `Unauthorized`. Use dentro de componente via `useServerFn` + `useQuery`, ou coloque a rota em `_authenticated/`.
- **Import com caminho inexistente** (ex.: `@/components/X` que não existe) quebra o build na hora. Sempre criar o arquivo antes de importar.
- **Pacotes Node-only** (sharp, canvas, puppeteer, child_process, fs.watch) não funcionam no runtime Cloudflare Worker. Se for adicionar dependência, confirmar que tem suporte a edge/Workers.
- **JSX desbalanceado / try sem catch / import duplicado** — o code-splitter do TanStack é mais estrito que o bundler normal e falha onde o `vite dev` perdoaria.

### 4. Não tocar em arquivos de configuração sem necessidade
Mudanças em `vite.config.ts`, `src/server.ts`, `src/router.tsx`, `src/start.ts`, `package.json` e `bun.lock` são as que mais derrubam preview. Se precisar mexer, rode build local antes.

### 5. Workflow recomendado
```bash
# antes do commit
bun install            # se mexeu em package.json
bunx tsc --noEmit      # checa tipos
bun run build          # confirma que builda
# só então: git add / commit / push
```

### 6. Quando o erro aparecer mesmo assim
- Aguarde 1–2 minutos (preview pode estar buildando).
- Abra o Lovable e veja a mensagem detalhada do build na aba de chat — ela mostra o stack trace do que falhou.
- Se o commit anterior buildava e o novo não, é algo no diff — reverta arquivo por arquivo no Claude até identificar.

## Resumo

Rode `bun run build` (e idealmente `bunx tsc --noEmit`) localmente antes de cada `git push`. Evite editar os arquivos auto-gerados do Lovable Cloud, não crie `src/pages/`, e respeite as convenções do TanStack Start. Isso elimina ~95% das ocorrências dessa mensagem.
