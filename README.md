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
navegador ou de computador **apaga o histórico local**. Use os botões
**"Baixar Backup"** (index.html → seção Configurações) regularmente e
guarde o arquivo `.json` gerado em local seguro (ex.: nuvem pessoal). O
botão **"Restaurar Backup"** devolve os dados a partir desse arquivo.

## Estrutura de arquivos

```
index.html        → lançamentos: entradas, cartão de crédito, saídas
relatorio.html     → relatório analítico (Módulo 2)
historico.html     → histórico anual comparativo (Módulo 3)
assets/
  db.js            → IndexedDB + utilitários (moeda, data, máscaras) — compartilhado pelas 3 páginas
  app.js           → lógica de index.html + motor de exportação XLSX/PDF/narrativa (compartilhado com relatorio.html)
  relatorio.js      → lógica específica de relatorio.html
  historico.js      → lógica específica de historico.html
  style.css        → estilo global
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
