# NÓS Conecta — Instruções para Claude Code

## Stack
- TanStack Start (rotas em `src/routes/`, nunca `src/pages/`)
- Vite + Bun
- Tailwind v4 (config inline em `src/styles.css`, sem `tailwind.config.ts`)
- Supabase (arquivos gerados pelo Lovable — não editar)
- Deploy via Lovable (Cloudflare Workers)

## Workflow obrigatório antes de cada commit

```bash
bunx tsc --noEmit   # checa tipos (strict: true)
bun run build       # confirma que builda sem error
```

Só commitar se `bun run build` terminar com `✓ built in ...s` sem erros.

## Arquivos que não devem ser editados

- `src/routeTree.gen.ts` — auto-gerado pelo Vite
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/client.server.ts`
- `src/integrations/supabase/auth-middleware.ts`
- `src/integrations/supabase/auth-attacher.ts`
- `src/integrations/supabase/types.ts`
- `.env` com `VITE_SUPABASE_*`
- `vite.config.ts`, `src/server.ts`, `src/router.tsx`, `src/start.ts` — só com extrema necessidade

## Regras TanStack Start

- Toda rota com `loader` precisa de `errorComponent` e `notFoundComponent`
- Não chamar server function com `requireSupabaseAuth` em `loader` de rota pública — usar dentro de componente via `useServerFn` + `useQuery`
- Criar arquivo antes de importar — import de caminho inexistente quebra o build
- Não usar pacotes Node-only (sharp, canvas, puppeteer, fs.watch) — runtime é Cloudflare Workers

## Padrões de design

- Componente KPI compartilhado: `src/components/finance/KpiCard.tsx`
- Botão primário: `variant="premium"` (degradê rosa-laranja)
- Botões secundários/outline: não alterar variant
- Rotas financeiras ativas: `/`, `/recebimentos`, `/pagamentos`, `/planejamento`
