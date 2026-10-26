#!/usr/bin/env node
/**
 * Copia os arquivos dos 3 depósitos do Lovable para o projeto NOVO.
 *
 *   NOVO_PROJETO_REF=xxxx node scripts/migracao/copiar-arquivos.mjs
 *
 * Precisa de `MIGRACAO_TOKEN` no ambiente (o mesmo valor cadastrado nos
 * Secrets do Lovable) e da função `migracao-exportar` publicada lá. Os
 * arquivos passam por este computador em memória, um de cada vez; nada é
 * gravado em disco nem impresso.
 *
 * Rodar de novo é seguro: cada arquivo é gravado com `x-upsert`.
 */
import { PROJETO_DO_LOVABLE, chavesDoProjeto, projetoNovo } from "./api.mjs";

const ref = projetoNovo();
const token = process.env.MIGRACAO_TOKEN;
if (!token) {
  console.error("Falta MIGRACAO_TOKEN no ambiente (o mesmo dos Secrets do Lovable).");
  process.exit(1);
}
const EXPORTAR = `https://${PROJETO_DO_LOVABLE}.supabase.co/functions/v1/migracao-exportar`;
const DEPOSITOS = ["crm-campaign-media", "wa-midia", "patient-files"];
const { url: novaUrl, servico } = await chavesDoProjeto(ref);

async function pedir(corpo) {
  const r = await fetch(EXPORTAR, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-migracao": token },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`migracao-exportar: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

const caminho = (nome) => nome.split("/").map(encodeURIComponent).join("/");
const resumo = [];

for (const deposito of DEPOSITOS) {
  const { arquivos } = await pedir({ acao: "listar", deposito });
  let copiados = 0;
  let bytes = 0;
  const falhas = [];
  for (let i = 0; i < arquivos.length; i += 100) {
    const lote = arquivos.slice(i, i + 100);
    const { links } = await pedir({ acao: "assinar", deposito, nomes: lote.map((a) => a.nome) });
    for (const { nome, url } of links) {
      try {
        const baixado = await fetch(url);
        if (!baixado.ok) throw new Error(`baixar ${baixado.status}`);
        const conteudo = await baixado.arrayBuffer();
        const tipo = lote.find((a) => a.nome === nome)?.tipo ?? baixado.headers.get("content-type");
        const subido = await fetch(`${novaUrl}/storage/v1/object/${deposito}/${caminho(nome)}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${servico}`,
            "x-upsert": "true",
            "Content-Type": tipo || "application/octet-stream",
          },
          body: conteudo,
        });
        if (!subido.ok)
          throw new Error(`subir ${subido.status} ${(await subido.text()).slice(0, 200)}`);
        copiados += 1;
        bytes += conteudo.byteLength;
      } catch (erro) {
        falhas.push(`${nome}: ${erro.message}`);
      }
      process.stdout.write(`\r${deposito}: ${copiados}/${arquivos.length}`.padEnd(60));
    }
  }
  console.log();
  if (falhas.length)
    console.log(`  ${falhas.length} falharam:\n  ` + falhas.slice(0, 20).join("\n  "));
  resumo.push({ deposito, origem: arquivos.length, copiados, MB: (bytes / 1e6).toFixed(1) });
}
console.table(resumo);
