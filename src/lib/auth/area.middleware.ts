import { createMiddleware } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { podeVerArea, type AreaDoApp } from "@/lib/auth/niveis-de-acesso";

/**
 * O nível de acesso valendo no SERVIDOR.
 *
 * ── Por que não basta esconder o menu ───────────────────────────────────
 *
 * Esconder no menu resolve o engano, não o acesso: as funções de servidor são
 * endpoints HTTP, e quem souber o nome chama direto. "A recepção não vê o
 * financeiro" precisa ser verdade do lado de cá, senão é combinado, não regra.
 *
 * ── Por que um middleware, e não uma linha em cada handler ──────────────
 *
 * Porque fica na assinatura. Trocar `requireClinicMembership` por
 * `exigeFinanceiro` na declaração da função diz, no lugar onde se lê o que a
 * função é, de quem ela é — e uma função nova nasce tendo de escolher. Uma
 * checagem no corpo some entre as outras vinte linhas, e some de vez quando
 * alguém copia o handler ao lado para começar outro.
 *
 * O contexto do middleware de baixo continua inteiro: `ownerId`, `unitId`,
 * `isAdmin`, `memberRole` e `supabase` seguem disponíveis.
 */
export function exigeArea(area: AreaDoApp) {
  return createMiddleware({ type: "function" })
    .middleware([requireClinicMembership])
    .server(async ({ next, context }) => {
      if (!podeVerArea(context.memberRole, area)) {
        // Mensagem curta e sem detalhe: quem chegou aqui ou errou o caminho,
        // ou está tentando. Nenhum dos dois ganha nada sabendo mais.
        throw new Error("Seu nível de acesso não inclui esta área.");
      }
      return next();
    });
}

/** Recebimentos, pagamentos, planejamento, contas, cartões, categorias. */
export const exigeFinanceiro = exigeArea("financeiro");

/** A Luna: manual, procedimentos liberados, casos, Olho de Deus, chave da IA. */
export const exigeAgenteIa = exigeArea("agente_ia");

/** Cadastros da clínica e gestão de pessoas. */
export const exigeConfiguracoes = exigeArea("configuracoes");

/** As conversas do WhatsApp, o funil e os disparos. */
export const exigeAtendimentos = exigeArea("atendimentos");
