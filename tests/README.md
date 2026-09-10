# Checagens

Módulos puros exercitados sem navegador e sem banco. Cada arquivo é um programa
que roda sozinho e sai com código 1 se algo falhar.

```bash
bun run tests/fatura.ts
```

Para rodar tudo:

```bash
for f in tests/*.ts; do bun run "$f" || exit 1; done
```

## Por que estão versionados aqui

Estavam num diretório temporário fora do repositório e **se perderam** quando o
ambiente foi reciclado — treze suítes, cerca de 385 checagens. Regra que saiu
daí: checagem que vale a pena escrever vale a pena versionar.

## O que entra aqui

Só o que é **função pura**: uma entrada, uma saída, nenhuma dependência de
rede, banco ou React. É onde o erro é silencioso — uma data de fatura errada
não levanta exceção, só produz um número que ninguém confere.

O que precisa de banco é verificado rodando a migration num Postgres de
verdade; o que precisa de tela, renderizando a página.
