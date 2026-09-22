// Os campos do manual de vendas, do lado do navegador.
//
// Só a FORMA mora aqui — os nomes dos campos e como cada um se chama na tela.
// O texto da instrução que o agente recebe, e principalmente as regras de
// repasse para humano, moram em `supabase/functions/_shared/instrucao-do-agente.ts`
// e não são espelhados: a tela pede a instrução pronta ao servidor. Uma cópia
// aqui poderia divergir e mostrar regras de segurança que não são as que estão
// valendo.

export interface EtapaDaConversa {
  nome?: string | null;
  sinais?: string | null;
  objetivo?: string | null;
  proximo_passo?: string | null;
}

export interface ManualDeVendas {
  tom?: string | null;
  saudacao?: string | null;
  etapas?: EtapaDaConversa[] | null;
  descoberta?: string | null;
  duvidas_de_procedimento?: string | null;
  apresentacao_preco?: string | null;
  objecoes?: { objecao?: string | null; resposta?: string | null }[] | null;
  agendamento?: string | null;
  fechamento?: string | null;
  observacoes?: string | null;
}

export const CAMPOS_DO_MANUAL = [
  "tom",
  "saudacao",
  "etapas",
  "descoberta",
  "duvidas_de_procedimento",
  "apresentacao_preco",
  "objecoes",
  "agendamento",
  "fechamento",
  "observacoes",
] as const;

export type CampoDoManual = (typeof CAMPOS_DO_MANUAL)[number];

/** Como cada campo se chama para quem lê — em pergunta, não em jargão. */
export const SECOES: { campo: CampoDoManual; titulo: string; pergunta: string }[] = [
  { campo: "tom", titulo: "Como falamos", pergunta: "Formal ou informal, emoji, frases curtas?" },
  { campo: "saudacao", titulo: "Como abrimos", pergunta: "A primeira mensagem da conversa." },
  {
    campo: "etapas",
    titulo: "As etapas da conversa",
    pergunta: "Por onde a conversa passa, do oi ao agendamento.",
  },
  {
    campo: "descoberta",
    titulo: "O que perguntamos",
    pergunta: "Antes de oferecer qualquer coisa.",
  },
  {
    campo: "duvidas_de_procedimento",
    titulo: "Como explicamos um procedimento",
    pergunta: "Quando perguntam como é, dói, quanto tempo leva.",
  },
  {
    campo: "apresentacao_preco",
    titulo: "Quando falamos de preço",
    pergunta: "Em que momento, e de que jeito.",
  },
  {
    campo: "objecoes",
    titulo: "Quando o paciente hesita",
    pergunta: "O que dizemos em cada dúvida.",
  },
  {
    campo: "agendamento",
    titulo: "Como marcamos a consulta",
    pergunta: "Como oferecemos horário e confirmamos.",
  },
  { campo: "fechamento", titulo: "Como fechamos", pergunta: "O que leva o paciente a decidir." },
  { campo: "observacoes", titulo: "Outros padrões", pergunta: "O que não coube acima." },
];

/** Texto do campo, com a correção humana por cima do aprendido. */
export function textoDoCampo(
  campo: CampoDoManual,
  aprendido: ManualDeVendas,
  correcoes: ManualDeVendas,
): string {
  const corrigido = (correcoes as Record<string, unknown>)[campo];
  const bruto = corrigido ?? (aprendido as Record<string, unknown>)[campo];
  if (!bruto) return "";
  // Correção humana de campo-lista chega como texto — a caixa de edição é uma
  // só para os dez campos. Devolver como veio é o certo.
  if (typeof bruto === "string") return bruto;

  // Etapas e objeções vêm como lista; viram texto legível para caber no mesmo
  // campo de edição que os outros.
  if (Array.isArray(bruto)) {
    const itens = bruto as Record<string, unknown>[];

    if (campo === "etapas") {
      return itens
        .filter((e) => campoEmTexto(e, "nome"))
        .map((e, i) => {
          const detalhes = [
            campoEmTexto(e, "sinais") && `Reconhece por: ${campoEmTexto(e, "sinais")}`,
            campoEmTexto(e, "objetivo") && `Objetivo: ${campoEmTexto(e, "objetivo")}`,
            campoEmTexto(e, "proximo_passo") && `Depois: ${campoEmTexto(e, "proximo_passo")}`,
          ].filter(Boolean);
          return [`${i + 1}. ${campoEmTexto(e, "nome")}`, ...detalhes].join("\n");
        })
        .join("\n\n");
    }

    return itens
      .filter((o) => campoEmTexto(o, "objecao"))
      .map((o) => `"${campoEmTexto(o, "objecao")}" → ${campoEmTexto(o, "resposta")}`)
      .join("\n\n");
  }
  return "";
}

/** Um campo de um item de lista, como texto limpo. Vazio quando não há. */
function campoEmTexto(item: Record<string, unknown> | null | undefined, chave: string): string {
  return String(item?.[chave] ?? "").trim();
}

/** Foi corrigido por uma pessoa? A tela marca isso — quem lê precisa saber o
 *  que é da IA e o que a equipe escreveu. */
export function foiCorrigido(campo: CampoDoManual, correcoes: ManualDeVendas): boolean {
  const v = (correcoes as Record<string, unknown>)[campo];
  return typeof v === "string" ? !!v.trim() : Array.isArray(v) ? v.length > 0 : false;
}
