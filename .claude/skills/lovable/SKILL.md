---
name: lovable
description: |
  Ativa quando trabalhando em projeto Lovable.dev com TanStack Start + Supabase.
  Fornece padrões de integração, workflow de deploy e regras de sync GitHub ↔ Lovable.
---

# Lovable Integration Skill

## Arquitetura do Projeto

Este projeto usa **TanStack Start (SSR)** — identificado pela presença de `vite.config.ts` + rotas em `src/routes/`.

- Server functions em `src/lib/**/*.functions.ts` — auto-deploy via push, sem prompt
- Rotas em `src/routes/` — auto-deploy via push
- Supabase Edge Functions em `supabase/functions/` — requerem prompt Lovable

## O que sincroniza automaticamente

Push para `main` → Lovable sincroniza `src/` automaticamente dentro de 1-2 min.

## O que requer prompt Lovable

Após commit+push, fornecer no Lovable:

```
📋 LOVABLE PROMPT:
> "Deploy the [nome] edge function"
```

ou

```
📋 LOVABLE PROMPT:
> "Apply pending Supabase migrations"
```

## Regra crítica de push

O Lovable pode fazer push para `main` a qualquer momento. Sempre:

```bash
git pull origin main --no-rebase
git push origin main
```

Se houver conflito, resolver manualmente mantendo as mudanças locais como primárias.

## Arquivos protegidos (não editar)

- `src/integrations/supabase/` — gerado pelo Lovable
- `src/routeTree.gen.ts` — auto-gerado pelo Vite
- `vite.config.ts`, `src/server.ts`, `src/router.tsx`, `src/start.ts`
