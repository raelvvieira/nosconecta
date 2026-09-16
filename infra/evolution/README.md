# Evolution API da NÓS

A instância própria de WhatsApp da clínica, isolada do CRM da agência.

## Por que isto existe

Hoje a corrente é **NÓS → Wavy → Evolution → WhatsApp**, e o elo do meio é da
própria agência. O Wavy não tem webhook de entrada: mensagem nova só é
descoberta por consulta, a cada 5 minutos, comparando contadores de não-lidas.
É a causa da lentidão do chat.

Com a Evolution própria, mensagem **chega** em vez de ser procurada, e o cron
de espelhamento deixa de existir.

## O que isto NÃO é

Não é uma instância dentro do Evolution que já roda na VPS. Aquilo
compartilharia banco e API key com o CRM — refazer em pequeno a amarra que o
espelho acabou de desfazer.

Aqui é um segundo Evolution completo: banco próprio, Redis próprio, chave
própria, volumes próprios, rede própria. **Divide o hardware com o CRM e mais
nada.** Mudar de máquina depois é copiar esta pasta e reler o QR.

## Antes de subir

Três coisas precisam ser verificadas na VPS. Rode e me mande a saída:

```bash
# 1. Memória livre. A Evolution + Postgres + Redis pedem ~1 GB.
free -h

# 2. O que já ocupa as portas — para saber se a 8081 está livre.
ss -ltnp | grep -E ':(8080|8081|5432|6379)' || echo "nenhuma dessas em uso"

# 3. Qual proxy reverso existe, para publicar o subdomínio nele.
docker ps --format '{{.Names}}\t{{.Image}}' | grep -Ei 'nginx|traefik|caddy' || echo "nenhum proxy em contêiner"
ls /etc/nginx/sites-enabled/ 2>/dev/null
```

## Subir

```bash
cd infra/evolution
cp .env.exemplo .env
openssl rand -hex 32   # vai em EVOLUTION_API_KEY
openssl rand -hex 24   # vai em POSTGRES_PASSWORD
nano .env              # preencher tudo, inclusive o SERVER_URL e o WEBHOOK_URL

docker compose up -d
docker compose logs -f api   # esperar "Server running on port 8080"
```

A porta fica **só no 127.0.0.1**. Quem expõe para a internet é o proxy reverso
que já existe na VPS, com o certificado dele — publicar a porta direto
deixaria a API key trafegando em HTTP puro.

Exemplo de bloco no Nginx, para o subdomínio `evo-nos`:

```nginx
location / {
    proxy_pass http://127.0.0.1:8081;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600;   # a conexão do WhatsApp é longa
}
```

## Conferir que está de pé

```bash
curl -s https://evo-nos.SEUDOMINIO.com.br | head -5
```

## O fato que decide o cronograma

**Um número de WhatsApp só pode estar em uma sessão por vez.** No instante em
que o número da clínica for conectado aqui, ele DESCONECTA da Evolution do
CRM, e o Wavy para de receber.

Não existe rodar os dois em paralelo para comparar. Então:

- Testar **com outro número** (um chip velho, o seu, qualquer um)
- A virada do número da clínica é uma janela combinada, com a equipe avisada

## Quando estiver no ar

O que falta do lado do sistema, e que eu escrevo depois que esta instância
responder:

1. `wa-webhook` — a Edge Function que recebe os eventos e grava no espelho com
   `origem = 'evolution'`
2. O envio de mensagem passando a sair por aqui em vez do CRM
3. A migration que remove os índices únicos antigos — **só depois** de as
   Edge Functions estarem no ar com a chave `(owner_id, origem, crm_*_id)`,
   senão a carga do espelho quebra
