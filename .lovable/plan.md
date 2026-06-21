# Plano: Menu primário + sidebar fixa + scroll isolado

## 1. Menu primário (módulos)

Novo estado em `Sidebar.tsx`: `view: "modules" | "financeiro"`. Por padrão, se a rota atual for `/`, `/recebimentos`, `/pagamentos`, `/planejamento`, `/comissoes`, `/configuracoes` → abre direto em `"financeiro"`. Caso contrário (futuro `/agenda`) → `"modules"`.

### View "modules"
Lista vertical de cards/botões grandes, mesmo estilo visual dos itens atuais:
- **Agenda** (ícone `Calendar`) — desabilitado (opacity 40, cursor not-allowed), sem rota ainda.
- **Financeiro** (ícone `Wallet` ou `LayoutGrid`) — ao clicar, muda `view` para `"financeiro"` (não navega; o submenu aparece).

Header da sidebar continua com logo "N" + "NÓS Conecta" + botão collapse.

### View "financeiro"
Mostra o submenu atual (Visão Geral, Recebimentos, Pagamentos, Planejamento, Comissões, Configurações).

No topo do submenu, **botão "Voltar"** (chevron-left + label "Módulos") que retorna `view` para `"modules"`. Quando `collapsed`, vira ícone-só com tooltip "Voltar aos módulos".

Pequeno label discreto acima da lista: "Financeiro" em uppercase/muted (seção atual).

## 2. Sidebar fixa + footer ancorado

Layout atual: `<aside>` é flex column dentro de um container que já scrolla junto com o conteúdo. Mudanças:

- O shell em `__root.tsx` vira: `<div className="h-screen flex overflow-hidden">` com `<Sidebar />` (imóvel) + `<main className="flex-1 overflow-y-auto custom-scroll">`.
- `<aside>` recebe `h-screen sticky top-0` (ou simplesmente fica dentro do flex de altura fixa).
- Estrutura interna: `flex flex-col h-full` — bloco do topo (logo + nav) com `flex-1 overflow-y-auto` se necessário, footer (Plano Premium / conta / Sair) com `mt-auto`. Já existe esse padrão; só garantir que o `mt-auto` empurra o footer para baixo dentro da altura total da viewport.

## 3. Scrollbar glass minimalista (apenas no `<main>`)

Adicionar utilitário em `src/styles.css`:

```css
.custom-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.custom-scroll::-webkit-scrollbar-track { background: transparent; }
.custom-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in oklab, var(--foreground) 12%, transparent);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.custom-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in oklab, var(--foreground) 22%, transparent);
  background-clip: padding-box;
}
.custom-scroll { scrollbar-width: thin; scrollbar-color: rgba(15,23,42,0.15) transparent; }
```

Aplicado só ao `<main>`. `body`/`html` ficam `overflow: hidden` (via classes no shell).

## 4. Arquivos afetados

- `src/components/finance/Sidebar.tsx` — novo state `view`, nova view "modules", botão voltar, footer com `mt-auto`.
- `src/routes/__root.tsx` — wrapper `h-screen flex overflow-hidden` + `<main className="flex-1 overflow-y-auto custom-scroll">`. Mobile mantém comportamento atual (FAB island já é fixed).
- `src/styles.css` — utilitário `.custom-scroll`.

## Fora de escopo
- Não criar rota `/agenda` (apenas item desabilitado no menu primário).
- Desktop only para o menu primário; mobile continua com a ilha inferior (Agenda pode entrar depois).
- Sem alteração de business logic.
