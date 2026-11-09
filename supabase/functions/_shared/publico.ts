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

/** Termos soltos de cada oferta (o "como reconhecer" cadastrado), por público. */
export interface TermosDoPublico {
  paciente_modelo?: string[];
  mentoria?: string[];
}

function temTermo(texto: string, termos?: string[]): boolean {
  return (termos ?? []).some((t) => {
    const limpo = semAcento(t).trim();
    return limpo.length >= 4 && texto.includes(limpo);
  });
}

/**
 * Decide o público pelo que a pessoa escreveu e pelo anúncio.
 *
 * O que a pessoa escreve manda: o anúncio é só uma pista. Quem clicou no
 * anúncio de paciente modelo e escreve "quero ser aluna" é da mentoria; sem
 * nenhuma palavra-chave na mensagem, vale o anúncio. Paciente modelo vence a
 * mentoria dentro de cada texto, porque o anúncio de paciente modelo também
 * fala em "mentoria" — e quem clicou nele quer o procedimento, não o curso.
 * Sem anúncio e sem palavra-chave, é atendimento.
 *
 * `termos` vem do cadastro das ofertas ("como reconhecer") e soma às palavras
 * fixas daqui.
 */
export function publicoDoContato(p: {
  anuncioTitulo?: string | null;
  anuncioCopy?: string | null;
  /** O que a pessoa escreveu (só o que veio dela). */
  mensagens?: string[];
  termos?: TermosDoPublico;
}): Publico {
  const anuncio = semAcento(`${p.anuncioTitulo ?? ""} ${p.anuncioCopy ?? ""}`);
  const texto = semAcento((p.mensagens ?? []).join(" \n "));
  const ler = (t: string): Publico | null => {
    if (MODELO.test(t) || temTermo(t, p.termos?.paciente_modelo)) return "paciente_modelo";
    if (MENTORIA.test(t) || temTermo(t, p.termos?.mentoria)) return "mentoria";
    return null;
  };
  return ler(texto) ?? ler(anuncio) ?? "atendimento";
}
