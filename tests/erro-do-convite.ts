import { strict as assert } from "node:assert";
import { motivoDaConta } from "../src/lib/auth/erro-do-convite.ts";

assert.equal(motivoDaConta({ code: "weak_password" }), "senha_fraca");
assert.equal(motivoDaConta({ message: "Password is known to be weak and easy to guess, please choose a different one." }), "senha_fraca");
assert.equal(motivoDaConta({ code: "email_exists" }), "email_em_uso");
assert.equal(motivoDaConta({ message: "A user with this email address has already been registered" }), "email_em_uso");
assert.equal(motivoDaConta({ message: "Service unavailable" }), "falhou");
console.log("ok — erros de senha e conta existente no convite");