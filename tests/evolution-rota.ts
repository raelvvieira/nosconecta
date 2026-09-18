// Checagens de por onde a mensagem sai.
//
// O caso que mais importa aqui é o do TESTE: enquanto a conexão nova é
// experimentada com um chip velho, existem duas conexões abertas ao mesmo
// tempo. Errar isto manda campanha de verdade, para paciente de verdade,
// pelo número errado.
import { caminhoDeEnvio } from "../supabase/functions/_shared/evolution-rota.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (obtido === esperado) ok++;
  else falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const CLINICA = "5548984195309";
const CHIP_DE_TESTE = "5548999998888";

// ── Hoje: só o CRM existe ────────────────────────────────────────────────
conferir(
  "sem instância nenhuma",
  caminhoDeEnvio({ instancia: null, telefoneDaInstancia: null, statusDoCrm: "open", telefoneDoCrm: CLINICA }),
  "crm",
);
conferir(
  "sem instância e CRM caído",
  caminhoDeEnvio({ instancia: null, telefoneDaInstancia: null, statusDoCrm: "disconnected", telefoneDoCrm: CLINICA }),
  "crm",
);

// ── O teste com outro chip: as duas abertas, números diferentes ──────────
conferir(
  "chip de teste não sequestra o envio",
  caminhoDeEnvio({
    instancia: "nos-a1b2c3d4",
    telefoneDaInstancia: CHIP_DE_TESTE,
    statusDoCrm: "open",
    telefoneDoCrm: CLINICA,
  }),
  "crm",
);
// Mesmo antes de o webhook informar o número do chip, o CRM aberto manda.
conferir(
  "chip de teste ainda sem número conhecido",
  caminhoDeEnvio({
    instancia: "nos-a1b2c3d4",
    telefoneDaInstancia: null,
    statusDoCrm: "open",
    telefoneDoCrm: CLINICA,
  }),
  "crm",
);

// ── A virada ─────────────────────────────────────────────────────────────
// O número da clínica aparece na nossa instância: migrou, mesmo que o CRM
// ainda não tenha percebido e continue dizendo "open".
conferir(
  "mesmo número dos dois lados = migrou",
  caminhoDeEnvio({
    instancia: "nos-a1b2c3d4",
    telefoneDaInstancia: CLINICA,
    statusDoCrm: "open",
    telefoneDoCrm: CLINICA,
  }),
  "evolution",
);
// Comparação por dígitos: os dois lados escrevem o número de jeitos diferentes.
conferir(
  "mesmo número escrito diferente",
  caminhoDeEnvio({
    instancia: "nos-a1b2c3d4",
    telefoneDaInstancia: "5548984195309",
    statusDoCrm: "open",
    telefoneDoCrm: "+55 (48) 98419-5309",
  }),
  "evolution",
);
// O CRM já percebeu que perdeu a sessão.
conferir(
  "CRM desconectado e Evolution aberta",
  caminhoDeEnvio({
    instancia: "nos-a1b2c3d4",
    telefoneDaInstancia: CLINICA,
    statusDoCrm: "disconnected",
    telefoneDoCrm: CLINICA,
  }),
  "evolution",
);
conferir(
  "CRM em erro e Evolution aberta",
  caminhoDeEnvio({
    instancia: "nos-a1b2c3d4",
    telefoneDaInstancia: null,
    statusDoCrm: "error",
    telefoneDoCrm: null,
  }),
  "evolution",
);
// Clínica que nunca teve CRM: a nossa conexão é a única que existe.
conferir(
  "sem CRM nenhum",
  caminhoDeEnvio({
    instancia: "nos-a1b2c3d4",
    telefoneDaInstancia: CLINICA,
    statusDoCrm: null,
    telefoneDoCrm: null,
  }),
  "evolution",
);

// ── Casos de borda que não podem virar decisão errada ────────────────────
// Número vazio não é "número igual": comparar "" com "" diria que migrou.
conferir(
  "dois números vazios não são iguais",
  caminhoDeEnvio({ instancia: "nos-x", telefoneDaInstancia: "", statusDoCrm: "open", telefoneDoCrm: "" }),
  "crm",
);
conferir(
  "número só com máscara não é igual",
  caminhoDeEnvio({ instancia: "nos-x", telefoneDaInstancia: "()- ", statusDoCrm: "open", telefoneDoCrm: "+ " }),
  "crm",
);
// O buraco que esta checagem fecha: durante o teste, um "connecting"
// passageiro do CRM mandaria o disparo inteiro pelo chip de teste. Com os
// dois números conhecidos e diferentes, não há status que mude a decisão.
conferir(
  "CRM piscando 'conectando' não entrega o disparo ao chip de teste",
  caminhoDeEnvio({
    instancia: "nos-x",
    telefoneDaInstancia: CHIP_DE_TESTE,
    statusDoCrm: "connecting",
    telefoneDoCrm: CLINICA,
  }),
  "crm",
);
conferir(
  "CRM caído não entrega o disparo ao chip de teste",
  caminhoDeEnvio({
    instancia: "nos-x",
    telefoneDaInstancia: CHIP_DE_TESTE,
    statusDoCrm: "disconnected",
    telefoneDoCrm: CLINICA,
  }),
  "crm",
);
// Sem saber o número da instância, o status do CRM volta a decidir — é a
// janela de segundos entre parear e o webhook contar qual número é.
conferir(
  "CRM caído e número da instância ainda desconhecido",
  caminhoDeEnvio({
    instancia: "nos-x",
    telefoneDaInstancia: null,
    statusDoCrm: "disconnected",
    telefoneDoCrm: CLINICA,
  }),
  "evolution",
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do caminho de envio`);
