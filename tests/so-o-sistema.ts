// A trava das Edge Functions: só o próprio sistema (chave de serviço) passa.
//
// O que não pode acontecer: a chave pública (anon), que vai dentro do site,
// abrir uma Edge Function e mandar WhatsApp ou ler mídia de outro consultório.
import { chamadaDoSistema } from "../supabase/functions/_shared/so-o-sistema.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const b64 = (o: unknown) =>
  btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (role: string) =>
  `${b64({ alg: "HS256" })}.${b64({ role, iss: "supabase" })}.assinatura`;

const SERVICO = jwt("service_role");
const ANON = jwt("anon");

conferir(
  "chave de serviço igual à do ambiente",
  chamadaDoSistema(`Bearer ${SERVICO}`, SERVICO),
  true,
);
conferir(
  "JWT de serviço, mesmo sem a chave no ambiente",
  chamadaDoSistema(`Bearer ${SERVICO}`, ""),
  true,
);
conferir("bearer em minúsculas", chamadaDoSistema(`bearer ${SERVICO}`, SERVICO), true);
conferir(
  "chave secreta nova (sb_secret), igual à do ambiente",
  chamadaDoSistema("Bearer sb_secret_abc", "sb_secret_abc"),
  true,
);

conferir("chave pública é barrada", chamadaDoSistema(`Bearer ${ANON}`, SERVICO), false);
conferir(
  "login de usuário é barrado",
  chamadaDoSistema(`Bearer ${jwt("authenticated")}`, SERVICO),
  false,
);
conferir("sem cabeçalho", chamadaDoSistema(null, SERVICO), false);
conferir("cabeçalho vazio", chamadaDoSistema("Bearer ", SERVICO), false);
conferir("lixo no lugar do token", chamadaDoSistema("Bearer a.b.c", SERVICO), false);
conferir(
  "outra chave sb_ qualquer",
  chamadaDoSistema("Bearer sb_publishable_x", "sb_secret_abc"),
  false,
);
conferir("ambiente sem chave não libera tudo", chamadaDoSistema("Bearer ", ""), false);

if (falhas.length) {
  console.error(`so-o-sistema: ${falhas.length} falha(s)\n` + falhas.join("\n"));
  process.exit(1);
}
console.log(`so-o-sistema: ${ok} checagens ok`);
