// Os campos do manual de vendas, do lado do navegador.
//
// Só a FORMA mora aqui — os nomes dos campos e como cada um se chama na tela.
// O texto da instrução que o agente recebe, e principalmente as regras de
// repasse para humano, moram em `supabase/functions/_shared/instrucao-do-agente.ts`
// e não são espelhados: a tela pede a instrução pronta ao servidor. Uma cópia
// aqui poderia divergir e mostrar regras de segurança que não são as que estão
// valendo.

export interface ManualDeVendas {
  tom?: string | null;
  saudacao?: string | null;
  descoberta?: string | null;
  apresentacao_preco?: string | null;
  objecoes?: { objecao?: string | null; resposta?: string | null }[] | null;
  fechamento?: string | null;
  observacoes?: string | null;
}

export const CAMPOS_DO_MANUAL = [
  "tom",
  "saudacao",
  "descoberta",
  "apresentacao_preco",
  "objecoes",
  "fechamento",
  "observacoes",
] as const;

export type CampoDoManual = (typeof CAMPOS_DO_MANUAL)[number];

/** Como cada campo se chama para quem lê — em pergunta, não em jargão. */
export const SECOES: { campo: CampoDoManual; titulo: string; pergunta: string }[] = [
  { campo: "tom", titulo: "Como falamos", pergunta: "Formal ou informal, emoji, frases curtas?" },
  { campo: "saudacao", titulo: "Como abrimos", pergunta: "A primeira mensagem da conversa." },
  { campo: "descoberta", titulo: "O que perguntamos", pergunta: "Antes de oferecer qualquer coisa." },
  { campo: "apresentacao_preco", titulo: "Quando falamos de preço", pergunta: "Em que momento, e de que jeito." },
  { campo: "objecoes", titulo: "Quando o paciente hesita", pergunta: "O que dizemos em cada dúvida." },
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
  if (typeof bruto === "string") return bruto;
  // Objeções vêm como lista; viram texto legível para caber no mesmo campo de
  // edição que os outros.
  if (Array.isArray(bruto)) {
    return bruto
      .filter((o: any) => String(o?.objecao ?? "").trim())
      .map((o: any) => `"${String(o.objecao).trim()}" → ${String(o.resposta ?? "").trim()}`)
      .join("\n\n");
  }
  return "";
}

/** Foi corrigido por uma pessoa? A tela marca isso — quem lê precisa saber o
 *  que é da IA e o que a equipe escreveu. */
export function foiCorrigido(campo: CampoDoManual, correcoes: ManualDeVendas): boolean {
  const v = (correcoes as Record<string, unknown>)[campo];
  return typeof v === "string" ? !!v.trim() : Array.isArray(v) ? v.length > 0 : false;
}
