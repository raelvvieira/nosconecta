# Seleção de unidade no diálogo "Confirmar ganho"

## Problema

Ao confirmar um ganho, o servidor chama `resolveUnitId`, que exige uma unidade explícita quando o admin tem 2+ unidades. O diálogo `ConfirmarGanho` não tem campo de unidade — os chamadores (`atendimentos.chat.tsx` e `DealDetailSheet.tsx`) só repassam `selectedUnitId` do seletor da sidebar, que pode estar em "Todas as unidades" (`null`). Resultado: toast de erro "Selecione a unidade." sem forma de resolver na própria tela.

## Solução

Adicionar um seletor de **Unidade** dentro do diálogo `ConfirmarGanho`, já pré-preenchido, editável antes de confirmar.

### Mudanças

1. **`src/components/atendimentos/pipeline/ConfirmarGanho.tsx`**
   - Aceita novas props: `units` (lista de unidades ativas), `isAdmin`, `unitIdInicial`.
   - Renderiza um seletor de unidade (mesmo estilo dos demais campos, `Select` ou botões) **somente quando** `isAdmin` e há 2+ unidades. Quem não é admin ou tem 1 unidade só não vê nada novo.
   - Pré-seleção na abertura, nesta ordem: `unitIdInicial` (o `selectedUnitId` da sidebar) → única unidade, se só houver uma → vazio.
   - `DadosGanho` ganha `unitId: string | null`.
   - Validação no confirmar: se o seletor está visível e sem escolha, mostra erro inline no diálogo ("Selecione a unidade.") em vez de deixar estourar no servidor.

2. **`src/routes/atendimentos.chat.tsx` e `src/components/atendimentos/pipeline/DealDetailSheet.tsx`**
   - Obtêm `units` e `isAdmin` de `useUnitSelection()` (já usam o hook) e passam as novas props ao `ConfirmarGanho`.
   - Enviam `unitId: dados.unitId ?? selectedUnitId ?? undefined` ao `confirmarGanho`.

3. **Servidor (`deals.functions.ts`)**: sem mudança — `resolveUnitId` já aceita `unitId` e já cai na unidade única quando aplicável.

## Resultado

- Admin com várias unidades: o diálogo abre com a unidade da sidebar já marcada; basta confirmar, ou trocar ali mesmo.
- Admin sem unidade selecionada: o diálogo pede a escolha inline, sem toast morto.
- Não-admin / unidade única: comportamento inalterado.

## Verificação

- Build + typecheck.
- Teste manual no preview: confirmar ganho pelo chat com unidade selecionada e sem unidade selecionada.
