/**
 * Acesso às contas novas (Supabase e Cloudflare) para a migração.
 *
 * ── Por que pela API, e não pela senha do banco ───────────────────────────
 *
 * A chave da conta do Supabase (`SUPABASE_ACCESS_TOKEN`) já roda SQL no banco
 * novo pela API de gerenciamento — sem a senha do banco ter de existir em
 * nenhum lugar além da anotação da pessoa. E a porta 5432 nem sempre está
 * aberta no ambiente onde estes scripts rodam; a API é HTTPS.
 *
 * ── O que NUNCA sai daqui ─────────────────────────────────────────────────
 *
 * Chaves lidas da API (service role, segredos) vão direto para quem precisa
 * delas — o cofre do banco, os segredos das funções, o Cloudflare — e nunca
 * para o terminal. Quem imprime chave em log transforma o log em credencial.
 */

const SUPABASE_API = "https://api.supabase.com/v1";
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

/** O projeto do Lovable. Só LEITURA de referência: nada aqui escreve nele. */
export const PROJETO_DO_LOVABLE = "ddfteoeehsticjhojpka";

function exigir(nome) {
  const valor = process.env[nome];
  if (!valor) {
    console.error(
      `Falta ${nome} no ambiente. Cadastre nas variáveis secretas do ambiente ` +
        "(nunca no chat) e abra uma sessão nova.",
    );
    process.exit(1);
  }
  return valor;
}

/** O projeto NOVO. Recusa o do Lovable: estes scripts montam a casa nova. */
export function projetoNovo() {
  const ref =
    process.env.NOVO_PROJETO_REF || process.argv.find((a) => a.startsWith("--ref="))?.slice(6);
  if (!ref) {
    console.error("Informe o projeto novo: NOVO_PROJETO_REF=xxxx ou --ref=xxxx");
    process.exit(1);
  }
  if (ref === PROJETO_DO_LOVABLE) {
    console.error(
      "Este é o projeto do Lovable — os scripts de migração só escrevem no projeto novo.",
    );
    process.exit(1);
  }
  return ref;
}

async function supabase(caminho, init = {}) {
  const token = exigir("SUPABASE_ACCESS_TOKEN");
  const resposta = await fetch(`${SUPABASE_API}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const texto = await resposta.text();
  if (!resposta.ok)
    throw new Error(`Supabase ${caminho}: ${resposta.status} ${texto.slice(0, 500)}`);
  return texto ? JSON.parse(texto) : null;
}

/** Roda SQL no banco novo e devolve as linhas. */
export function sql(ref, query) {
  return supabase(`/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

/** Lista os projetos da conta — para a pessoa achar o `ref` do novo. */
export function projetos() {
  return supabase("/projects");
}

/** As chaves do projeto novo. Quem chama decide para onde vão; não imprima. */
export async function chavesDoProjeto(ref) {
  const lista = await supabase(`/projects/${ref}/api-keys?reveal=true`);
  const achar = (nome) => lista.find((k) => k.name === nome)?.api_key;
  return { url: `https://${ref}.supabase.co`, anon: achar("anon"), servico: achar("service_role") };
}

/** Grava segredos das funções do projeto novo: [{ name, value }]. */
export function gravarSegredosDasFuncoes(ref, segredos) {
  return supabase(`/projects/${ref}/secrets`, { method: "POST", body: JSON.stringify(segredos) });
}

/** Os NOMES dos segredos já cadastrados (a API não devolve os valores). */
export async function nomesDosSegredos(ref) {
  const lista = await supabase(`/projects/${ref}/secrets`);
  return lista.map((s) => s.name);
}

async function cloudflare(caminho, init = {}) {
  const token = exigir("CLOUDFLARE_API_TOKEN");
  const resposta = await fetch(`${CLOUDFLARE_API}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const corpo = await resposta.json();
  if (!corpo.success)
    throw new Error(`Cloudflare ${caminho}: ${JSON.stringify(corpo.errors).slice(0, 500)}`);
  return corpo.result;
}

/** A conta da Cloudflare (a primeira a que a chave dá acesso). */
export async function contaDaCloudflare() {
  const contas = await cloudflare("/accounts");
  if (!contas.length) throw new Error("A chave da Cloudflare não dá acesso a nenhuma conta.");
  return contas[0];
}

/** Grava um segredo no Worker sem passar pelo terminal. */
export async function gravarSegredoNoWorker(conta, worker, nome, valor) {
  await cloudflare(`/accounts/${conta}/workers/scripts/${worker}/secrets`, {
    method: "PUT",
    body: JSON.stringify({ name: nome, text: valor, type: "secret_text" }),
  });
}
