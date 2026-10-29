// Quem é o consultório, para a assistente falar dele: o nome e quem faz a
// avaliação. Antes isto estava escrito no código ("NÓS Odontologia", "Dra.
// Mariane"); agora vem da ficha (`clinicas`), e cada consultório tem o seu.

/**
 * Quem faz a avaliação, já com o artigo, para entrar no meio da frase: "com
 * a Dra. Mariane", "quem confirma é o Dr. Paulo". O artigo só sai do título
 * (Dr./Dra.), que é o que a própria pessoa escolheu escrever; sem título, o
 * nome entra sem artigo. Sem nome nenhum, "a equipe".
 */
export function quemAvalia(responsavel?: string | null): string {
  const nome = String(responsavel ?? "").trim();
  if (!nome) return "a equipe";
  if (/^dra\.?\s/i.test(nome)) return `a ${nome}`;
  if (/^dr\.?\s/i.test(nome)) return `o ${nome}`;
  return nome;
}

/** O nome da assistente, ou "Luna", que é o padrão de quem não escolheu. */
export function nomeDaAssistente(nome?: string | null): string {
  return String(nome ?? "").trim() || "Luna";
}

export interface IdentidadeDoConsultorio {
  /** "NÓS Odontologia". Sem ficha, "o consultório". */
  nome: string;
  /** "Dra. Mariane". `null` quando ninguém cadastrou: a assistente diz "a
   *  equipe" (ver `quemAvalia`). */
  responsavel: string | null;
}

/** Falha de leitura nunca derruba a resposta: vira o texto neutro. */
export async function identidadeDoConsultorio(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
): Promise<IdentidadeDoConsultorio> {
  try {
    const { data } = await supabase
      .from("clinicas")
      .select("nome, responsavel_avaliacao")
      .eq("owner_id", ownerId)
      .maybeSingle();
    return {
      nome: String(data?.nome ?? "").trim() || "o consultório",
      responsavel: String(data?.responsavel_avaliacao ?? "").trim() || null,
    };
  } catch (e) {
    console.warn("[identidade] ficha não lida:", e);
    return { nome: "o consultório", responsavel: null };
  }
}
