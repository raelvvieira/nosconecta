/**
 * Os temas do sistema — a cor de destaque, escolhida por pessoa.
 *
 * ── O que um tema muda, e o que não muda ──────────────────────────────────
 *
 * Só a MARCA: o degradê do botão principal, a pílula ativa do menu, o anel de
 * foco, os destaques suaves e as três primeiras cores dos gráficos. Fundo,
 * texto e as cores que querem dizer alguma coisa (verde de pago, vermelho de
 * atrasado, âmbar de atenção) ficam iguais em todos: trocar o vermelho de um
 * boleto vencido por gosto pessoal é tirar o aviso da tela.
 *
 * ── Onde mora a escolha ───────────────────────────────────────────────────
 *
 * Em `user_metadata.tema`, na própria conta: a pessoa escolhe no computador e
 * o celular já abre igual, sem tabela nova nem migration. Uma cópia fica no
 * navegador só para a primeira pintura da página não piscar na cor padrão.
 *
 * As cores em si moram no CSS (`html[data-tema=…]` em `styles.css`); aqui fica
 * só o que a TELA precisa para desenhar a amostra.
 */

export interface Tema {
  id: TemaId;
  nome: string;
  /** Uma linha, para a escolha não ser só pela cor. */
  sobre: string;
  /** As três paradas do degradê — é o que a amostra mostra. */
  degrade: [string, string, string];
}

export const TEMAS = [
  {
    id: "nos",
    nome: "NÓS",
    sobre: "O original, rosa e coral",
    degrade: ["#f55f95", "#ff7a59", "#ffb086"],
  },
  {
    id: "areia",
    nome: "Areia",
    sobre: "Bege e dourado, como o cartão",
    degrade: ["#a8845a", "#c9a46c", "#e3caa0"],
  },
  {
    id: "oceano",
    nome: "Oceano",
    sobre: "Azul petróleo e turquesa",
    degrade: ["#1f6f8b", "#2a9db0", "#7fd1d8"],
  },
  {
    id: "ametista",
    nome: "Ametista",
    sobre: "Roxo e lilás",
    degrade: ["#6d4bd8", "#8f6cf0", "#c3aefb"],
  },
  {
    id: "salvia",
    nome: "Sálvia",
    sobre: "Verde oliva e verde água",
    degrade: ["#5f7a52", "#7f9c6e", "#b9cfa8"],
  },
  {
    id: "grafite",
    nome: "Grafite",
    sobre: "Preto e cinza, sem cor",
    degrade: ["#1c1c1f", "#3a3a40", "#77777f"],
  },
] as const;

export type TemaId = (typeof TEMAS)[number]["id"];

export const TEMA_PADRAO: TemaId = "nos";

const GUARDADO = "nos:tema";

export function temaValido(valor: unknown): TemaId {
  return TEMAS.some((t) => t.id === valor) ? (valor as TemaId) : TEMA_PADRAO;
}

/** Pinta a página com o tema. O padrão não leva atributo: é o CSS de sempre. */
export function aplicarTema(id: TemaId) {
  if (typeof document === "undefined") return;
  const raiz = document.documentElement;
  if (id === TEMA_PADRAO) delete raiz.dataset.tema;
  else raiz.dataset.tema = id;
  try {
    localStorage.setItem(GUARDADO, id);
  } catch {
    /* sem armazenamento local: só a primeira pintura sai no padrão */
  }
}

/** O que ficou no navegador da última vez — para pintar antes de a conta
 *  responder. */
export function temaGuardado(): TemaId {
  try {
    return temaValido(localStorage.getItem(GUARDADO));
  } catch {
    return TEMA_PADRAO;
  }
}
