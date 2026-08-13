import { ddd, type CrmContact } from "./contacts.functions";

/**
 * O recorte da base: quem sobra depois da busca e das fichas de DDD.
 *
 * Vive separado da tela porque é o cálculo que decide para quem a mensagem vai.
 * Um erro aqui não aparece como tela torta — aparece como alguém de outro
 * estado recebendo um disparo que era do DDD 48.
 */
export function filtrarContatos(
  contatos: CrmContact[],
  { busca, ddds }: { busca: string; ddds: Set<string> },
): CrmContact[] {
  const q = busca.trim().toLocaleLowerCase("pt-BR");
  const digitos = busca.replace(/\D/g, "");

  return contatos.filter((c) => {
    if (ddds.size > 0) {
      const d = ddd(c.phone);
      // Sem DDD reconhecível, fica de fora de qualquer recorte por DDD. Chutar
      // colocaria alguém que não é de lá dentro do disparo.
      if (!d || !ddds.has(d)) return false;
    }
    if (!q) return true;
    if (c.name.toLocaleLowerCase("pt-BR").includes(q)) return true;
    // Número compara só dígitos: quem digita "98419" procura
    // "+55 (48) 98419-5309", que na tela tem parênteses e traço no meio.
    return Boolean(digitos) && (c.phone ?? "").replace(/\D/g, "").includes(digitos);
  });
}

/** DDDs presentes na base, com quantos cada um tem, do maior para o menor. */
export function contarPorDdd(contatos: CrmContact[]): [string, number][] {
  const contagem = new Map<string, number>();
  for (const c of contatos) {
    const d = ddd(c.phone);
    if (d) contagem.set(d, (contagem.get(d) ?? 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * Liga/desliga a seleção do recorte visível.
 *
 * Mexe apenas em quem está na tela: trocar o filtro não pode apagar uma seleção
 * feita com o filtro anterior (marcar o DDD 48, depois o 51, tem de somar), nem
 * arrastar junto quem sumiu da lista.
 */
export function alternarSelecaoDoRecorte(
  selecionados: Set<string>,
  recorte: CrmContact[],
): Set<string> {
  const todosDentro = recorte.length > 0 && recorte.every((c) => selecionados.has(c.id));
  const next = new Set(selecionados);
  for (const c of recorte) {
    if (todosDentro) next.delete(c.id);
    else next.add(c.id);
  }
  return next;
}
