// As três contas puras de `por-na-agenda.ts`.
//
// O resto do arquivo é I/O e não dá para exercitar sem banco. Estas três dão, e
// são justamente as que, erradas, produzem registro errado em vez de erro: hora
// de fim impossível, telefone que não casa com ficha nenhuma, e rótulo de sala
// que faz a consulta da Luna parecer diferente de todas as outras.
import {
  somarMinutos,
  telefoneDoContato,
  rotuloDaSala,
} from "../supabase/functions/_shared/por-na-agenda.ts";

let feitas = 0;
function conferir(oQue: string, real: unknown, esperado: unknown) {
  feitas++;
  if (real !== esperado) {
    console.error(`FALHOU ${oQue}: esperava ${String(esperado)}, veio ${String(real)}`);
    process.exit(1);
  }
}

// ── A hora de fim ───────────────────────────────────────────────────────────

// O caso da Luana: combo de 90 minutos às 8h.
conferir("08:00 + 90", somarMinutos("08:00", 90), "09:30");
conferir("08:00 + 60", somarMinutos("08:00", 60), "09:00");
conferir("vira a hora", somarMinutos("08:45", 30), "09:15");
conferir("meia-noite", somarMinutos("00:00", 90), "01:30");
conferir("zero minuto", somarMinutos("14:00", 0), "14:00");
conferir("hora de um dígito", somarMinutos("8:5", 10), "08:15");
// Virar o dia daria 25:00, que o Postgres recusa — e um insert recusado é a
// paciente sem nada marcado. Aparar deixa visível e visivelmente errado.
conferir("não passa da meia-noite", somarMinutos("23:30", 90), "23:59");
conferir("exatamente no teto", somarMinutos("23:00", 59), "23:59");
// Entrada que não é hora volta como veio: inventar "00:00" marcaria a pessoa
// na madrugada.
conferir("texto solto volta igual", somarMinutos("qualquer", 60), "qualquer");
conferir("vazio volta igual", somarMinutos("", 60), "");

// ── O telefone ──────────────────────────────────────────────────────────────

conferir("JID normal", telefoneDoContato("554899522191@s.whatsapp.net"), "554899522191");
// O `:12` é identificador de dispositivo, e tem de sair ANTES dos não-dígitos:
// senão viraria `55489952219112` e não casaria com ficha nenhuma.
conferir(
  "JID com dispositivo",
  telefoneDoContato("554899522191:12@s.whatsapp.net"),
  "554899522191",
);
conferir("nove dígitos", telefoneDoContato("5548999522191@s.whatsapp.net"), "5548999522191");
conferir("sem arroba", telefoneDoContato("554899522191"), "554899522191");
conferir("vazio", telefoneDoContato(""), "");
conferir("só o arroba", telefoneDoContato("@s.whatsapp.net"), "");
// Grupo: o id não é telefone, e `porNaAgenda` recusa por não sobrar dígito.
conferir("grupo não é telefone", telefoneDoContato("@g.us"), "");

// ── O rótulo da sala ────────────────────────────────────────────────────────

conferir(
  "cadeira e unidade",
  rotuloDaSala(["Cadeira de Odontologia", "NÓS Florianópolis"]),
  "Cadeira de Odontologia · NÓS Florianópolis",
);
// É assim que o cadastro real está: o nome da cadeira tem espaço sobrando.
conferir(
  "espaço sobrando sai",
  rotuloDaSala(["Cadeira de Odontologia ", "NÓS Florianópolis "]),
  "Cadeira de Odontologia · NÓS Florianópolis",
);
// Quando a clínica batiza a sala com o nome da unidade, repetir seria
// "NÓS Florianópolis · NÓS Florianópolis".
conferir(
  "parte repetida não repete",
  rotuloDaSala(["NÓS Florianópolis", "NÓS Florianópolis"]),
  "NÓS Florianópolis",
);
conferir(
  "acento e caixa não criam duas",
  rotuloDaSala(["nos florianopolis", "NÓS Florianópolis"]),
  "nos florianopolis",
);
// O "NÓS" é compartilhado pelas duas unidades: comparar por trecho apagaria
// uma delas e deixaria duas cadeiras com o mesmo rótulo.
conferir(
  "unidades diferentes continuam duas",
  rotuloDaSala(["NÓS Porto Alegre", "NÓS Florianópolis"]),
  "NÓS Porto Alegre · NÓS Florianópolis",
);
conferir("nada vira vazio", rotuloDaSala([null, undefined, "  "]), "");
conferir("só a unidade", rotuloDaSala([null, "NÓS Florianópolis"]), "NÓS Florianópolis");

console.log(`ok — ${feitas} checagens de quem põe na agenda`);
