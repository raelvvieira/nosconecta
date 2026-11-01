// O público de uma conversa: para qual funil ela vai.
//
// Três funis, cada um com Leads, Clientes e Perdidos:
//  - atendimento: o dia a dia, quem quer ser paciente;
//  - paciente_modelo: quem chegou para ser paciente modelo da mentoria;
//  - mentoria: profissional querendo comprar a vaga de aluna da mentoria.
//
// A régua lê o anúncio que trouxe a pessoa e o que ela escreveu. Módulo puro,
// com `tests/publico.ts`.

export type Publico = "atendimento" | "paciente_modelo" | "mentoria";

export const PUBLICOS: { value: Publico; label: string }[] = [
  { value: "atendimento", label: "Atendimento" },
  { value: "paciente_modelo", label: "Paciente modelo" },
  { value: "mentoria", label: "Mentoria" },
];

export function ehPublico(v: unknown): v is Publico {
  return PUBLICOS.some((p) => p.value === v);
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const MODELO = /paciente(s)?[\s-]*modelo/;
const MENTORIA = /mentoria|mentorias|quero ser aluna|turma de dezembro|curso de harmoniza/;

/**
 * Decide o público pelo anúncio e pelas mensagens da pessoa.
 *
 * Paciente modelo vence a mentoria, porque o anúncio de paciente modelo
 * também fala em "mentoria" — e quem clicou nele quer o procedimento, não o
 * curso. Sem anúncio e sem palavra-chave, é atendimento.
 */
export function publicoDoContato(p: {
  anuncioTitulo?: string | null;
  anuncioCopy?: string | null;
  /** O que a pessoa escreveu (só o que veio dela). */
  mensagens?: string[];
}): Publico {
  const anuncio = semAcento(`${p.anuncioTitulo ?? ""} ${p.anuncioCopy ?? ""}`);
  if (MODELO.test(anuncio)) return "paciente_modelo";
  if (MENTORIA.test(anuncio)) return "mentoria";
  const texto = semAcento((p.mensagens ?? []).join(" \n "));
  if (MODELO.test(texto)) return "paciente_modelo";
  if (MENTORIA.test(texto)) return "mentoria";
  return "atendimento";
}
