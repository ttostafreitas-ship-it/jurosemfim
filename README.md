# Meu Financeiro

Sistema de organização financeira doméstica. Front-end puro (HTML + CSS +
JavaScript), banco de dados **IndexedDB** (só no navegador), gráficos via
Chart.js, exportação para Excel (SheetJS) e PDF (jsPDF).

## Privacidade dos dados

O GitHub (e o GitHub Pages) armazena **apenas o código-fonte** deste
repositório. Todos os lançamentos, cartões e históricos ficam gravados
exclusivamente no **IndexedDB do navegador** de quem está usando o site —
nunca são enviados para nenhum servidor, nem sobem para o Git. Isso é
verdade independentemente de o JavaScript estar legível ou ofuscado (veja
a seção sobre Terser abaixo): a ofuscação esconde a lógica do código de um
olhar casual, mas **não é o que garante a privacidade dos seus dados** — o
que garante é o app nunca enviar nada para fora do seu navegador.

Como os dados moram só no navegador: limpar os dados do site, trocar de
navegador ou de computador **apaga o histórico local**. Use o botão
**"Baixar Backup"** (index.html → seção Configurações) regularmente. Ele
pergunta se você quer proteger o arquivo com senha:
- **Sem senha** → gera `financeiro-backup-AAAA-MM-DD.json`, legível por
  qualquer editor de texto.
- **Com senha** → gera `financeiro-backup-AAAA-MM-DD.financeiro-backup`,
  cifrado com AES-GCM 256 bits (chave derivada da senha via PBKDF2). Sem a
  senha, o arquivo não pode ser lido por ninguém — **inclusive por você**:
  não existe recuperação se esquecer a senha, guarde-a em um lugar seguro.

O botão **"Restaurar Backup"** detecta sozinho qual dos dois formatos foi
selecionado (pela extensão do arquivo) e pede a senha quando necessário.

## Segurança

Camadas adicionadas para reduzir a superfície de ataque de um site
estático publicado publicamente:

- **CSP** (Content-Security-Policy via `<meta>` nos 3 HTMLs): só permite
  scripts do próprio site e do jsDelivr, bloqueia qualquer tentativa de
  `fetch`/`XHR`/`WebSocket` (`connect-src 'none'` — o app não precisa
  disso, já que tudo é local) e restringe fontes/imagens/estilos às
  origens realmente usadas.
- **SRI** (Subresource Integrity) nas 4 bibliotecas carregadas via CDN
  (Chart.js, SheetJS, jsPDF, jspdf-autotable): cada `<script>` tem um hash
  `sha384-...` calculado a partir do arquivo real hospedado no jsDelivr.
  Se o CDN um dia servir um arquivo diferente do hash gravado (comprometido
  ou trocado), o navegador **recusa executar o script** em vez de rodá-lo
  silenciosamente. Ao atualizar a versão de alguma biblioteca no futuro,
  recalcule o hash (ex.: `openssl dgst -sha384 -binary arquivo.js | openssl base64 -A`)
  — um hash desatualizado quebra o carregamento daquela biblioteca.
- **`noindex, nofollow`**: pede a buscadores para não indexar as páginas.
- **PIN de tela** (índice, relatório e histórico): pede um PIN de 4 a 6
  dígitos na primeira vez que abre o app em cada navegador (cria e guarda
  como hash SHA-256, nunca em texto puro) e depois pede de novo uma vez
  por sessão do navegador. **Importante — isto não é criptografia**: é só
  uma trava de tela para evitar que alguém pegue o aparelho e veja os
  números de relance. Quem abrir o DevTools do navegador (Application →
  IndexedDB) vê os dados normalmente, com PIN certo, errado ou nenhum —
  o PIN não impede acesso técnico, só a leitura casual. A proteção real
  dos dados continua sendo puramente arquitetural (nunca saem do seu
  navegador) mais, opcionalmente, a senha do backup cifrado acima.
  "Esqueci o PIN" só oferece limpar os dados do site (apaga tudo) — não
  existe recuperação, então guarde o PIN em lugar seguro.
- **Backup cifrado opcional**: ver seção "Privacidade dos dados" acima.

## Estrutura de arquivos

```
index.html        → lançamentos: entradas, cartão de crédito, saídas
relatorio.html     → relatório analítico (Módulo 2)
historico.html     → histórico anual comparativo (Módulo 3)
manifest.json      → manifesto PWA ("adicionar à tela inicial")
assets/
  db.js            → IndexedDB + PIN + criptografia de backup + utilitários — compartilhado pelas 3 páginas
  app.js           → lógica de index.html + motor de exportação XLSX/PDF/narrativa (compartilhado com relatorio.html)
  relatorio.js      → lógica específica de relatorio.html
  historico.js      → lógica específica de historico.html
  style.css        → estilo global
  icon-192.png / icon-512.png → ícones do manifest PWA
```

> Nota: `db.js` não estava na lista original de 4 arquivos do pedido —
> foi separado para não triplicar ~400 linhas de código de banco de dados
> idênticas entre as 3 páginas. Da mesma forma, o motor de exportação
> (XLSX/PDF/narrativa automática) vive em `app.js` e é reaproveitado por
> `relatorio.html`, já que os dois botões "Exportar" geram o mesmo
> relatório completo.

## Rodando localmente

Basta abrir `index.html` no navegador (duplo clique ou "Abrir com..."). Não
precisa de servidor, build ou instalação — tudo roda 100% no navegador,
com bibliotecas carregadas via CDN (Chart.js, SheetJS, jsPDF).

Se preferir rodar por um servidor local (opcional, evita eventuais
bloqueios de `file://` em alguns navegadores):

```bash
# Python 3
python -m http.server 8080
# depois abra http://localhost:8080
```

## Limitações conhecidas

- **Cores/negrito no Excel exportado**: a versão gratuita (Community) do
  SheetJS usada aqui tem suporte limitado para estilos de célula (fundo
  azul do cabeçalho, zebra, cores condicionais). O código já tenta aplicar
  esses estilos e os **formatos numéricos (moeda e %) funcionam
  corretamente** em qualquer versão — mas as cores podem não aparecer,
  dependendo da versão da biblioteca carregada via CDN. Colorir células de
  forma garantida exigiria a versão paga (SheetJS Pro).
- **Terser não é "ofuscação forte"**: ele minifica e renomeia variáveis,
  dificultando a leitura casual do código, mas não é equivalente a
  ferramentas de ofuscação pesada (control-flow flattening, strings
  cifradas etc.). Para esse nível, a ferramenta indicada seria o pacote
  `javascript-obfuscator`. Como o pedido original especificou Terser,
  foi o que foi configurado abaixo.
- **Sazonalidade de janeiro/fevereiro**: os percentuais (+15% material
  escolar, +20% IPTU/IPVA em janeiro; +15% em fevereiro) são estimativas
  fixas definidas na regra de negócio, não calculadas a partir do seu
  histórico real — sirva-se delas como um alerta, não como previsão exata.

---

## Deploy no GitHub Pages — passo a passo

1. **Criar o repositório no GitHub** (se ainda não existir):
   - Acesse github.com → "New repository" → nome, por exemplo, `meu-financeiro`.
   - O plano gratuito do GitHub Pages só publica sites de **repositórios
     públicos** (repos privados exigem GitHub Pro/Team para Pages). Marque
     como público se for usar o plano gratuito.

2. **Enviar o código** (rodar dentro da pasta do projeto):
   ```bash
   git init
   git add .
   git commit -m "Versão inicial"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/meu-financeiro.git
   git push -u origin main
   ```

3. **Ativar o GitHub Pages**:
   - No repositório, vá em **Settings → Pages**.
   - Em "Build and deployment" → "Source", escolha **Deploy from a branch**.
   - Branch: **main**, pasta: **/ (root)**. Salvar.
   - Em alguns minutos o site fica disponível em:
     `https://SEU-USUARIO.github.io/meu-financeiro/`

4. **Atualizações futuras**: sempre que editar os arquivos, repita
   `git add .`, `git commit -m "..."`, `git push` — o GitHub Pages
   republica automaticamente a cada push na branch `main`.

### Estrutura de branches sugerida

```
main → produção (o que o GitHub Pages publica)
dev  → desenvolvimento (código legível/comentado, se você mantiver uma
        versão ofuscada separada em main — veja a seção Terser abaixo)
```

Se você optar por publicar o código ofuscado em `main` e manter a versão
legível em `dev`, lembre-se de sempre desenvolver a partir de `dev` e só
gerar/copiar a versão ofuscada para `main` na hora de publicar.

`package.json`/`package-lock.json` (ferramentas de build) ficam **só na
branch `dev`** — a `main` carrega apenas os arquivos que o site precisa
para rodar. Isso significa que `npm run build` só funciona rodando a
partir de um checkout que tenha esses arquivos (ou seja, sempre a partir
de `dev`, nunca direto em `main`). Fluxo completo para publicar uma
atualização:

```bash
git checkout dev
# ... edite os arquivos, teste, commit na dev ...
git push origin dev

git checkout main
git merge dev -m "Merge dev para publicar atualização"
npm run build                                 # reofusca assets/*.js nesta branch (main)
git rm package.json package-lock.json         # mantém a main só com o necessário
git add -A
git commit -m "Build: versão ofuscada"
git push origin main

git checkout dev                              # volta a desenvolver a partir da dev
```

---

## Ofuscação com Terser — comandos exatos

Isso reduz o tamanho dos arquivos e dificulta a leitura casual do
JavaScript (renomeia variáveis, remove espaços/comentários). Rode a partir
da pasta raiz do projeto (onde fica este README).

1. **Instalar o Terser** (precisa de Node.js instalado):
   ```bash
   npm install --save-dev terser
   ```

2. **Gerar as versões minificadas/ofuscadas** (sobrescrevem os arquivos em
   `assets/`, com renomeio de variáveis via `mangle` e remoção de
   comentários via `format.comments: false`):
   ```bash
   npx terser assets/db.js -o assets/db.js -c -m --format comments=false
   npx terser assets/app.js -o assets/app.js -c -m --format comments=false
   npx terser assets/relatorio.js -o assets/relatorio.js -c -m --format comments=false
   npx terser assets/historico.js -o assets/historico.js -c -m --format comments=false
   ```
   - `-c` = compress (remove código morto, encurta expressões)
   - `-m` = mangle (renomeia variáveis locais para nomes curtos sem
     significado semântico)
   - `--format comments=false` = remove todos os comentários

3. **Conferir que tudo ainda funciona** abrindo `index.html`,
   `relatorio.html` e `historico.html` no navegador antes de publicar.

4. **Commitar a versão ofuscada** na branch de produção (`main`, se você
   adotar a separação de branches sugerida acima).

> Importante: rode os comandos acima sobre uma **cópia** do projeto (ou na
> branch `dev` fazendo checkout para uma branch temporária) caso queira
> preservar o código-fonte legível em algum lugar — depois de ofuscado, o
> arquivo não volta a ficar legível ("desofuscar" não é uma operação
> confiável). Manter o histórico do Git com os commits do código legível
> já cumpre esse papel.
