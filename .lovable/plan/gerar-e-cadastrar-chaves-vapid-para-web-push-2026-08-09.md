# Gerar e cadastrar chaves VAPID para Web Push

1. Executar `node scripts/generate-vapid-keys.mjs` para gerar o par de chaves P-256 no formato exato exigido pelo `push-send`:
   - `VAPID_PUBLIC_KEY`: ponto não comprimido (65 bytes, começa com `B`), base64url, 87 caracteres.
   - `VAPID_PRIVATE_KEY`: escalar `d` (32 bytes), base64url, 43 caracteres.
2. Cadastrar os três valores como secrets do projeto:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` → `mailto:raelvvieira@gmail.com`
3. Confirmar o cadastro no chat sem expor a chave privada.

> Nota de segurança: a chave privada será gerada pelo script local e passada diretamente para a ferramenta de secrets, sem ser impressa no chat ou commitada no repositório. Como o Lovable não possui uma ferramenta que gere chaves P-256 diretamente, o script do projeto é o caminho mais seguro para obter o formato correto.
