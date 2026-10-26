#!/usr/bin/env node
/**
 * Fecha a recepção: troca a chave por uma que ninguém conhece e apaga a cópia
 * local. Rodar logo depois da cópia final (fase 5).
 *
 * Uso: NOVO_PROJETO_REF=xxxx node scripts/migracao/fechar-recepcao.mjs
 */
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { gravarSegredosDasFuncoes, projetoNovo } from "./api.mjs";

const ref = projetoNovo();
await gravarSegredosDasFuncoes(ref, [
  { name: "MIGRACAO_RECEPCAO_TOKEN", value: randomBytes(32).toString("base64url") },
]);
rmSync(new URL("./.recepcao", import.meta.url), { force: true });
console.log("Recepção fechada. Apague também a função: supabase functions delete migracao-receber");
