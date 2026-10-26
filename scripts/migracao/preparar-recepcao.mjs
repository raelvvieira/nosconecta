#!/usr/bin/env node
/**
 * Abre a porta de `migracao-receber` no projeto NOVO: gera uma chave
 * descartável, grava como segredo da função lá e guarda uma cópia local em
 * `scripts/migracao/.recepcao` (fora do git) para `sql-de-envio.mjs` usar.
 *
 * Essa chave só abre a recepção do projeto novo, que ainda está vazio — não
 * dá acesso a nada do Lovable. Fechar depois: `fechar-recepcao.mjs`.
 *
 * Uso: NOVO_PROJETO_REF=xxxx node scripts/migracao/preparar-recepcao.mjs
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { gravarSegredosDasFuncoes, projetoNovo } from "./api.mjs";

const ref = projetoNovo();
const token = randomBytes(32).toString("base64url");
await gravarSegredosDasFuncoes(ref, [{ name: "MIGRACAO_RECEPCAO_TOKEN", value: token }]);
writeFileSync(new URL("./.recepcao", import.meta.url), JSON.stringify({ ref, token }), {
  mode: 0o600,
});
console.log("Recepção aberta no projeto novo. Próximo: sql-de-envio.mjs");
