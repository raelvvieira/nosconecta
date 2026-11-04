import type { Evolucao } from "./clinical-record.functions";

/** "editada" aparece quando a alteração veio bem depois de a anotação nascer. */
export function foiEditada(ev: Pick<Evolucao, "createdAt" | "updatedAt">): boolean {
  return new Date(ev.updatedAt).getTime() - new Date(ev.createdAt).getTime() > 60_000;
}
