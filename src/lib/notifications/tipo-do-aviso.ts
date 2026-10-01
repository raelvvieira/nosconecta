// O que a etiqueta na agenda deve dizer.
//
// ── O defeito que trouxe este arquivo ──────────────────────────────────
//
// O calendário escrevia **"pediu remarcar"** em cima de QUALQUER aviso em
// aberto daquela consulta. O comentário do código admitia o chute: "aviso da
// equipe em aberto para esta consulta — na prática, 'o paciente pediu
// remarcar'".
//
// Não é na prática. Medido em 01/10, na caixa inteira da clínica:
//
//   23 avisos "Resposta não entendida"
//    1 aviso  "Paciente quer remarcar"
//
// A etiqueta errava 23 de 24 vezes. E o caso que a clínica trouxe mostra o
// tamanho do estrago: o Daniel respondeu "Opa", "Tudo bem, pode ser", "To aqui
// em baixo" e "Pediram para esperar um pouco" — ou seja, confirmou e depois
// avisou que tinha chegado. A agenda mostrou "pediu remarcar" ao lado de uma
// consulta "Confirmado", e a equipe ficou olhando para uma contradição que o
// sistema inventou.
//
// ── Por que o servidor não mandava o tipo ──────────────────────────────
//
// `avisosPorAgendamento` devolvia só uma lista de ids. A tela não tinha como
// saber o que o aviso dizia nem se quisesse — o dado parava no servidor. Por
// isso o conserto não é trocar uma palavra: é a tela passar a receber o que o
// aviso é.

/** As duas coisas que um aviso de consulta pode significar para quem olha a
 *  agenda. Vocabulário fechado de propósito: a tela não decide em cima de
 *  texto em português, que a clínica edita na tela de automações. */
export type TipoDeAviso = "remarcar" | "resposta";

/** Palavras que só aparecem em aviso de quem quer desmarcar. */
const DE_REMARCAR = ["remarcar", "reagendar", "cancelar", "desmarcar", "adiar"];

/**
 * O tipo de um aviso, pelo TÍTULO.
 *
 * Só o título, nunca o corpo — e isso é a decisão que importa aqui. O corpo
 * carrega as palavras do PACIENTE ("Fulano respondeu: posso remarcar?"), e o
 * título carrega a leitura que o sistema fez.
 *
 * Classificar pelo corpo faria a etiqueta afirmar "pediu remarcar" justamente
 * nas respostas que o sistema NÃO entendeu — que são as que precisam de uma
 * pessoa lendo, não de um palpite com cara de certeza.
 *
 * O padrão é `"resposta"`: na dúvida, "tem coisa para ler" é verdade sempre;
 * "pediu remarcar" é uma afirmação sobre o que o paciente quer.
 */
export function tipoDoAviso(titulo: string | null | undefined): TipoDeAviso {
  const t = String(titulo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return DE_REMARCAR.some((p) => t.includes(p)) ? "remarcar" : "resposta";
}

/** O que a etiqueta escreve. Curto porque cabe dentro do bloco da consulta,
 *  que no celular tem a largura de um dedo. */
export const ROTULO_DO_AVISO: Record<TipoDeAviso, string> = {
  remarcar: "pediu remarcar",
  // "ver resposta" e não "não entendida": a etiqueta é para quem está olhando
  // o dia e decidindo o que fazer, e o que ela precisa dizer é a AÇÃO. Que o
  // sistema não entendeu é problema do sistema, não recado para a recepção.
  resposta: "ver resposta",
};

/** A cor. Pedir para remarcar mexe na agenda e é aviso de verdade; uma
 *  resposta para ler é tarefa, não alarme — pintar as duas de laranja ensina a
 *  ignorar o laranja. */
export const TOM_DO_AVISO: Record<TipoDeAviso, string> = {
  remarcar: "bg-warning-soft text-warning",
  resposta: "bg-muted text-muted-foreground",
};
