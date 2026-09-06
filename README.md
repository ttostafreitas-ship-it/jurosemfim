# Meu Financeiro

Sistema de organização financeira doméstica. O front-end é estático
(HTML + CSS + JavaScript puro, sem build) e os dados de cada usuário ficam
numa conta no **Supabase** (autenticação + banco Postgres). Gráficos com
Chart.js, exportação para Excel (SheetJS) e PDF (jsPDF).

Site publicado: <https://ttostafreitas-ship-it.github.io/meu-financeiro/>

## Como funciona o acesso

- **Entrar / Cadastrar** é feito em `login.html`, por **nome de usuário +
  senha**. No cadastro você também informa um **email de recuperação**; a
  senha inicial é gerada pelo servidor e enviada para esse email (troque-a
  depois de entrar).
- A verificação do nome de usuário e o login acontecem numa **Edge
  Function** do Supabase (`supabase/functions/auth-username`). O email do
  perfil nunca é devolvido ao navegador — o front-end recebe apenas a
  sessão do Supabase.
- Sem sessão ativa, `index.html`, `relatorio.html` e `historico.html`
  redirecionam automaticamente para `login.html` (`assets/route-guard.js`).
- O botão **Sair** no menu encerra a sessão.

## Onde os dados ficam e como estão protegidos

Todos os lançamentos, cartões, gastos e histórico são gravados em tabelas
do Supabase, **sempre com o `user_id` do dono**. O isolamento entre contas
é garantido por **Row Level Security (RLS)**: cada policy só deixa a linha
ser lida/escrita quando `auth.uid() = user_id`, e um trigger impede trocar
o dono de um registro (`supabase/schema.sql`). Ou seja: mesmo conhecendo a
`anon key` (que é pública por natureza e fica no código do site), ninguém
consulta os dados de outra pessoa.

Camadas adicionais:

- **CSP** (`<meta>` nos HTMLs): scripts só do próprio site e do jsDelivr;
  `connect-src` limitado ao domínio do Supabase; sem `eval`, sem outros
  destinos de rede.
- **SRI** (Subresource Integrity): todas as bibliotecas de CDN
  (`supabase-js`, Chart.js, SheetJS, jsPDF, jspdf-autotable) carregam com
  hash `sha384-…` e versão fixa. Se o CDN servir um arquivo diferente, o
  navegador recusa executar. Ao atualizar uma versão, recalcule o hash:
  `openssl dgst -sha384 -binary arquivo.js | openssl base64 -A`.
- **`noindex, nofollow`** nas páginas.
- A **`service_role key`** do Supabase **nunca** aparece no front-end —
  ela só existe como variável de ambiente da Edge Function
  (ver `SUPABASE_SETUP.md`).

## Backup

Em `index.html` → seção **Configurações**:

- **Baixar Backup** exporta todas as suas tabelas num JSON. Ele pergunta
  se você quer proteger com senha:
  - **Sem senha** → `financeiro-backup-AAAA-MM-DD.json`, texto legível.
  - **Com senha** → `financeiro-backup-AAAA-MM-DD.financeiro-backup`,
    cifrado com AES-GCM 256 bits (chave derivada da senha via PBKDF2).
    **Não há recuperação se esquecer a senha.**
- **Restaurar Backup** detecta o formato pela extensão, pede a senha
  quando necessário e **substitui** os dados atuais da sua conta pelos do
  arquivo. Backups no formato antigo (offline / "versão 1") não são
  compatíveis com a conta online.

## Estrutura de arquivos

```
index.html         → lançamentos: entradas, cartão de crédito, saídas
relatorio.html     → relatório analítico
historico.html     → histórico anual comparativo
login.html         → entrar / cadastrar
manifest.json      → manifesto PWA ("adicionar à tela inicial")
assets/
  supabase-config.js → cria o cliente Supabase (URL + anon key públicas)
  route-guard.js     → redireciona para login.html sem sessão
  db.js              → camada de dados (Supabase) + utilitários; API `MF`
  supabase-auth.js   → login/cadastro/recuperação via Edge Function (MFAuth)
  login.js           → controlador de login.html
  app.js             → lógica de index.html + exportação XLSX/PDF/narrativa
  relatorio.js       → lógica de relatorio.html
  historico.js       → lógica de historico.html
  style.css          → estilo global
  icon-192.png / icon-512.png → ícones do PWA
scripts/gerar_icones.py → regenera os PNGs dos ícones (Python puro)
supabase/
  schema.sql                     → tabelas, RLS, triggers (rodar no SQL Editor)
  functions/auth-username/index.ts → Edge Function de autenticação
```

`assets/db.js` expõe o objeto `MF` com a mesma assinatura que `app.js`,
`relatorio.js` e `historico.js` esperam; as diferenças entre o formato da
UI e o do banco (datas `DD/MM/AA` ↔ `DATE`, campo `tipo` do gasto ↔ coluna
`tipo_cobranca`, etc.) são resolvidas dentro dele. Preferências puramente
de tela (ex.: ordenação por situação) ficam no `localStorage` do
navegador, não no banco.

## Rodando localmente

1. Tenha um projeto Supabase configurado conforme `SUPABASE_SETUP.md`
   (schema aplicado, Edge Function publicada, envio de email configurado)
   e preencha `assets/supabase-config.js` com a **Project URL** e a
   **anon key**.
2. Sirva a pasta por HTTP (o login usa `fetch`, que não funciona em
   `file://`):

   ```bash
   python -m http.server 8080
   # abra http://localhost:8080/login.html
   ```

Não há passo de build: o que está no repositório é o que roda.

## Deploy (GitHub Pages)

**Settings → Pages → Build and deployment → Deploy from a branch**, branch
`main`, pasta `/ (root)`. Cada `git push` na `main` republica o site.

Se o domínio do site mudar, ajuste também `Site URL` / `Redirect URL` na
configuração de Authentication do Supabase e as variáveis `ALLOWED_ORIGIN`
/ `SITE_URL` da Edge Function.

## Limitações conhecidas

- **Estilos no Excel exportado**: a versão Community do SheetJS tem suporte
  limitado a cor de célula/negrito. Os **formatos numéricos (moeda e %)
  funcionam**; as cores de fundo podem não aparecer dependendo da versão
  carregada via CDN.
- **Sazonalidade de janeiro/fevereiro**: os acréscimos usados na projeção
  (+35% em janeiro por material escolar e IPTU/IPVA, +15% em fevereiro)
  são fatores fixos da regra de negócio, não calculados a partir do seu
  histórico real — trate como alerta, não como previsão exata.
- **Realtime / multiaba**: o app lê os dados ao abrir a página e após cada
  edição; ele não recebe atualizações ao vivo de outra aba ou dispositivo
  aberto ao mesmo tempo — recarregue a página para ver mudanças externas.
