# Sidebar fixo no desktop + scrollbar glass minimalista

## 1. Sidebar desktop fixo em tela cheia

Em `src/components/finance/Sidebar.tsx`, no `<aside>` da versão desktop (`hidden lg:flex ...`), adicionar:

- `lg:sticky lg:top-0`
- `lg:h-screen` (em vez de altura natural)
- `lg:overflow-hidden` no aside, e `overflow-y-auto` apenas no `<nav>` interno (caso a lista de itens cresça no futuro)

Resultado: ao rolar a página, o menu lateral fica parado. Logo no topo, itens no meio (`flex-1`), e o rodapé (Plano Premium / NÓS Conecta · Administrador / Sair) permanece fixado na parte de baixo do sidebar — exatamente como na imagem anotada.

Nenhuma alteração no layout mobile (a "ilha" inferior continua igual).

## 2. Scrollbar global minimalista (glass)

Em `src/styles.css`, adicionar regras globais para a barra de rolagem do conteúdo principal (WebKit + Firefox):

```css
/* Glass scrollbar */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(15, 23, 42, 0.12) transparent;
}
*::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb {
  background: rgba(15, 23, 42, 0.10);
  border-radius: 999px;
  border: 1px solid transparent;
  background-clip: padding-box;
}
*::-webkit-scrollbar-thumb:hover {
  background: rgba(15, 23, 42, 0.22);
  background-clip: padding-box;
}
```

A barra fica fina (6px), translúcida, quase invisível em repouso e ganha um pouco de contraste no hover — estilo glass discreto.

## Arquivos alterados
- `src/components/finance/Sidebar.tsx` — classes do `<aside>` desktop
- `src/styles.css` — regras de scrollbar global

Sem mudanças em rotas, lógica ou no FAB mobile.
