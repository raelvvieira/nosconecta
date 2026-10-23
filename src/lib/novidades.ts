/**
 * As novidades que o sistema anuncia num pop-up, uma vez por pessoa.
 *
 * Pedido da clínica em 23/10, para ficar: toda atualização que a equipe
 * precisa saber ganha uma entrada aqui. Quem entra no sistema depois dela vê
 * o pop-up UMA vez — fechar pelo X também conta como visto.
 *
 * O "já vi" mora em `user_metadata.novidades_vistas`, na conta: quem viu no
 * computador não vê de novo no celular.
 *
 * Para anunciar algo novo: acrescente no TOPO, com um `id` que nunca se
 * repete. Só a mais recente não vista aparece — dez avisos em fila no
 * primeiro login de alguém seria um formulário, não uma novidade.
 */
export interface Novidade {
  id: string;
  titulo: string;
  texto: string;
  /** Conteúdo especial dentro do pop-up. `"temas"` mostra a escolha de tema. */
  extra?: "temas";
  /** Onde isso fica depois, para a pessoa achar de novo. */
  ondeFica?: string;
}

export const NOVIDADES: Novidade[] = [
  {
    id: "temas-2026-10",
    titulo: "Seu sistema, do seu jeito",
    texto: "Agora você escolhe a cor do seu NÓS Conecta. A escolha vale só para você.",
    extra: "temas",
    ondeFica: "Você pode mudar quando quiser em Configurações → Aparência.",
  },
];

export function proximaNovidade(vistas: readonly string[] | null | undefined): Novidade | null {
  const ja = new Set(vistas ?? []);
  return NOVIDADES.find((n) => !ja.has(n.id)) ?? null;
}
