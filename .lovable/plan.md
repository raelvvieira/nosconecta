## Objetivo

Na página de Agenda mobile, os três botões brancos do canto superior direito (cadeado, sliders, calendário) saem do header e entram na barra inferior — no mesmo padrão visual dos itens "Financeiro / Recebimentos / Pagamentos / Planejamento" que vemos nas outras páginas, com o FAB "+" centralizado.

## Layout proposto na bottom bar (rota `/agenda`)

```
[ Bloquear ]  [ Filtros ]   ( + )   [ Calendário ]  [ Lista/Mês ]
```

- 2 itens à esquerda + FAB + 2 itens à direita (mesma simetria das páginas financeiras).
- Itens com ícone + label pequeno, mesmo tratamento de cor/active state das outras abas.
- O quarto item à direita aproveita o toggle de visualização já existente (`day` / `list` / `month`) — um botão "Visões" que abre um mini popover ou cicla, para preencher a simetria. Se preferir, deixamos só 1 item à direita (Calendário) sem o quarto — pergunto abaixo.

## Mudanças técnicas

1. **`src/components/finance/mobile-fab-context.tsx`**
   - Estender o contexto para aceitar, além do `fab`, uma lista opcional de "ações secundárias" (`extraActions: { label, icon, onClick }[]`) registradas pela página ativa.
   - Novo hook `useRegisterMobileNavActions(actions)` análogo ao `useRegisterMobileFab`.

2. **`src/components/finance/Sidebar.tsx`**
   - No ramo `inAgenda` da bottom bar, em vez de renderizar só o FAB centralizado, montar a estrutura simétrica usando as ações registradas pela Agenda + o FAB existente. Reusar o mesmo `renderItem` (ícone em pílula + label) para manter o estilo idêntico ao das páginas financeiras.

3. **`src/components/agenda/mobile/MobileAgenda.tsx`**
   - Remover os três `<button>` do header (linhas 414–442) — sobra só o título + subtítulo.
   - Registrar via `useRegisterMobileNavActions` as ações `Bloquear` (Lock), `Filtros` (SlidersHorizontal), `Calendário` (CalendarDays), apontando para os handlers/estados que já existem (`onNewBlock`, `setFilterOpen`, `setCalendarOpen`).

## Fora do escopo

- Não mexer no desktop (`hidden lg:block`) — os botões do header desktop continuam como estão.
- Não mexer no comportamento dos sheets (`MobileFilterSheet`, `MobileCalendarSheet`).
- Não mexer nas outras rotas (`/`, `/recebimentos`, `/pagamentos`, `/planejamento`).

## Pergunta rápida

Prefere **2 + FAB + 2** (incluindo um quarto item "Visões" para alternar dia/lista/mês) ou **2 + FAB + 1** (só Calendário à direita, deixando assimétrico mas mais limpo)?
