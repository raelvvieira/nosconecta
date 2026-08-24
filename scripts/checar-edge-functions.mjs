#!/usr/bin/env node
/**
 * Varredura de identificadores inexistentes nas Edge Functions.
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * `bunx tsc --noEmit` cobre só `src/`. As Edge Functions rodam em Deno e ficam
 * de fora — e a "checagem" que se usava no lugar era transpilar cada arquivo
 * com `Bun.Transpiler`, o que prova apenas que ele COMPILA. Transpilador não
 * faz análise de escopo: um identificador que não existe atravessa inteiro.
 *
 * Foi exatamente assim que `handleResolveBatch(ownerId, body.patients ?? [])`
 * chegou em produção num arquivo onde a requisição é desestruturada e `body`
 * nunca foi declarado. A clínica viu `ReferenceError: body is not defined` ao
 * tentar disparar.
 *
 * ESLint com `no-undef` e o parser de TypeScript faz a análise de escopo de
 * verdade, e aponta o nome e a linha.
 *
 * Uso: `node scripts/checar-edge-functions.mjs`
 */
import { ESLint } from "eslint";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const parser = require("@typescript-eslint/parser");

/**
 * O que existe em tempo de execução no Deno, mais os tipos de plataforma que
 * aparecem em anotação.
 *
 * Declarar os tipos é o que separa sinal de ruído: `RequestInit` e `CryptoKey`
 * não são variáveis, mas o `no-undef` os vê como identificadores livres numa
 * anotação. A alternativa seria desligar a regra para eles — e desligar
 * devolveria o buraco que este arquivo existe para fechar.
 */
const GLOBAIS = [
  // Runtime do Deno e da plataforma
  "Deno", "console", "fetch", "Response", "Request", "Headers", "URL", "URLSearchParams",
  "crypto", "FormData", "File", "Blob", "AbortSignal", "AbortController",
  "TextEncoder", "TextDecoder", "atob", "btoa", "setTimeout", "clearTimeout",
  "setInterval", "clearInterval", "queueMicrotask", "structuredClone",
  // Tipos de plataforma usados em anotação
  "RequestInit", "ResponseInit", "HeadersInit", "BodyInit", "BlobPart",
  "CryptoKey", "CryptoKeyPair", "JsonWebKey", "AlgorithmIdentifier",
  "ReadableStream", "WritableStream", "TransformStream",
];

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.ts"],
      languageOptions: {
        parser,
        ecmaVersion: "latest",
        sourceType: "module",
        globals: Object.fromEntries(GLOBAIS.map((g) => [g, "readonly"])),
      },
      rules: {
        "no-undef": "error",
        // `variables: false` de propósito. Com `true`, a regra acusa toda
        // constante de módulo lida dentro de uma função declarada acima dela —
        // padrão que este código usa bastante e que NÃO é defeito: quando a
        // função roda, o módulo já foi avaliado inteiro. Rodando assim, deu 4
        // falsos positivos e nenhum defeito real, e verificação que grita à toa
        // é verificação que se aprende a ignorar.
        "no-use-before-define": ["error", { functions: false, classes: true, variables: false }],
      },
    },
  ],
});

const resultados = await eslint.lintFiles(["supabase/functions/**/*.ts"]);
const problemas = resultados.filter((r) => r.errorCount > 0);

if (problemas.length === 0) {
  const n = resultados.length;
  console.log(`ok — ${n} arquivos de Edge Function, nenhum identificador inexistente`);
  process.exit(0);
}

const formatter = await eslint.loadFormatter("stylish");
console.error(await formatter.format(problemas));
console.error(
  "\nIdentificador que não existe NÃO aparece no build — só quando a função roda,\n" +
    "como ReferenceError na cara de quem estava usando o sistema.",
);
process.exit(1);
