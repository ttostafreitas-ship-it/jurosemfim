/* ==========================================================================
   MEU FINANCEIRO — camada de dados (Supabase) + utilitários compartilhados

   Carregado por index.html, relatorio.html e historico.html DEPOIS de
   supabase-config.js (que cria window.supabaseClient) e ANTES dos scripts
   específicos de cada página (app.js / relatorio.js / historico.js).

   Toda leitura/escrita é feita nas tabelas do Supabase, sempre com
   user_id = usuário autenticado. O isolamento entre contas é garantido
   pelas policies de Row Level Security definidas em supabase/schema.sql —
   este arquivo apenas conversa com a API.

   A API pública (objeto MF) tem a MESMA assinatura da versão anterior em
   IndexedDB, então app.js / relatorio.js / historico.js não precisam saber
   onde os dados moram. As diferenças de formato entre o que a UI usa e o
   que o banco espera (datas em DD/MM/AA vs. DATE, campo "tipo" do gasto vs.
   coluna "tipo_cobranca", etc.) são resolvidas aqui, nas bordas.
   ========================================================================== */

const MF = (() => {

  const sb = window.supabaseClient;

  // ------------------------------------------------------------------------
  // Sessão / usuário
  // ------------------------------------------------------------------------

  async function usuarioAtual() {
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) {
      const err = new Error('Sessão expirada. Entre novamente.');
      err.code = 'SEM_SESSAO';
      throw err;
    }
    return data.user;
  }

  async function uid() {
    return (await usuarioAtual()).id;
  }

  // Ponto único por onde as operações passam — mantém o aviso de erro
  // centralizado, como na versão IndexedDB.
  async function executar(promessa) {
    try {
      const resultado = await promessa;
      if (resultado && resultado.error) throw resultado.error;
      return resultado ? resultado.data : undefined;
    } catch (e) {
      console.error('Erro ao acessar o banco de dados:', e);
      if (e && e.code === 'SEM_SESSAO') {
        Util.toast('Sessão expirada. Redirecionando para o login...', 'erro');
        setTimeout(() => { window.location.href = 'login.html'; }, 1200);
      } else {
        Util.toast('Erro ao acessar seus dados. Verifique sua conexão e tente de novo.', 'erro');
      }
      throw e;
    }
  }

  // ------------------------------------------------------------------------
  // Conversão de datas: a UI trabalha com "DD/MM/AA"; as colunas `data` e
  // `data_limite` são do tipo DATE no Postgres e exigem "AAAA-MM-DD".
  // ------------------------------------------------------------------------

  function brParaISO(valor) {
    if (!valor) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
    const p = Util.parseDataBR(valor);
    if (!p) return null;
    return `${p.ano}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
  }

  function isoParaBR(valor) {
    if (!valor) return '';
    const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return valor;
    return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
  }

  // ------------------------------------------------------------------------
  // Whitelist de colunas por tabela — só o que existe no schema é enviado,
  // evitando erro "column X does not exist" quando a UI carrega campos
  // extras (id de um registro lido, timestamps, etc.).
  // ------------------------------------------------------------------------

  const COLUNAS = {
    lancamentos: ['tipo', 'descricao', 'origem', 'valor', 'data', 'situacao', 'valor_pago', 'dias_atraso', 'data_limite', 'cartao_vinculado_id', 'mes', 'ano'],
    cartoes: ['nome', 'vencimento', 'limite_total', 'fatura_atual', 'mes', 'ano'],
    gastos_cartao: ['cartao_id', 'descricao', 'tipo_cobranca', 'taxa_juros', 'valor_original', 'valor_juros', 'valor_total', 'mes', 'ano'],
    historico_anual: ['ano', 'mes', 'total_entradas', 'total_saidas', 'total_aberto'],
    configuracoes: ['logo_url', 'senha_trocada', 'plano', 'plano_expira'],
  };

  function apenasColunas(registro, tabela) {
    const saida = {};
    for (const col of COLUNAS[tabela]) {
      if (registro[col] !== undefined) saida[col] = registro[col];
    }
    return saida;
  }

  // grava (upsert) e devolve o id gerado/atualizado
  async function gravar(tabela, registro) {
    const linha = apenasColunas(registro, tabela);
    linha.user_id = await uid();
    if (registro.id) linha.id = registro.id;
    const data = await executar(sb.from(tabela).upsert(linha).select('id').single());
    return data ? data.id : registro.id;
  }

  async function apagar(tabela, id) {
    return executar(sb.from(tabela).delete().eq('id', id));
  }

  // ------------------------------------------------------------------------
  // Utilitários de formatação / máscara (idênticos à versão anterior —
  // são puramente de UI e não têm nada a ver com onde os dados moram)
  // ------------------------------------------------------------------------

  const NOMES_MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  const NOMES_MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

  const Util = {
    formatMoeda(valor) {
      const n = Number(valor) || 0;
      return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },

    formatNumero(valor, casas = 2) {
      const n = Number(valor) || 0;
      return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    },

    formatPercent(valor, casas = 1) {
      const n = Number(valor) || 0;
      return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%';
    },

    // "3,5" -> 3.5 / "1.234,56" -> 1234.56
    parseDecimalBR(str) {
      if (typeof str === 'number') return str;
      if (!str) return 0;
      const limpo = String(str).trim().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
      const n = parseFloat(limpo);
      return isNaN(n) ? 0 : n;
    },

    nomeMes(mesNum, abreviado = false) {
      const i = Math.max(1, Math.min(12, Number(mesNum))) - 1;
      return abreviado ? NOMES_MESES_ABREV[i] : NOMES_MESES[i];
    },

    hojeBR() {
      const d = new Date();
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const aa = String(d.getFullYear()).slice(2);
      return `${dd}/${mm}/${aa}`;
    },

    mesAnoAtual() {
      const d = new Date();
      return { mes: d.getMonth() + 1, ano: d.getFullYear() };
    },

    // "DD/MM/AA" -> { dia, mes, ano (4 dígitos) }
    parseDataBR(dataStr) {
      if (!dataStr || typeof dataStr !== 'string') return null;
      const m = dataStr.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
      if (!m) return null;
      const dia = parseInt(m[1], 10);
      const mes = parseInt(m[2], 10);
      let ano = parseInt(m[3], 10);
      if (ano < 100) ano += 2000;
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
      return { dia, mes, ano };
    },

    // aplica máscara DD/MM/AA progressivamente enquanto o usuário digita
    aplicarMascaraData(valorAtual) {
      const digitos = valorAtual.replace(/\D/g, '').slice(0, 6);
      if (digitos.length > 4) return digitos.slice(0, 2) + '/' + digitos.slice(2, 4) + '/' + digitos.slice(4);
      if (digitos.length > 2) return digitos.slice(0, 2) + '/' + digitos.slice(2);
      return digitos;
    },

    // liga máscara monetária estilo "caixa registradora" (digita da direita pra esquerda)
    ligarMascaraMoeda(input) {
      if (!input.dataset.cents) input.dataset.cents = '0';
      const redraw = () => {
        const cents = parseInt(input.dataset.cents || '0', 10);
        input.value = cents === 0 ? '' : Util.formatMoeda(cents / 100);
        // input.value é setado via JS (não digitação nativa, pois o keydown
        // usa preventDefault) — sem isto, quem escuta "input" neste campo
        // (ex.: cálculo de juros ao vivo) nunca seria notificado.
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      input.addEventListener('keydown', (e) => {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          let next = (input.dataset.cents || '0') + e.key;
          next = next.replace(/^0+(?=\d)/, '');
          if (next.length > 13) return;
          input.dataset.cents = next;
          redraw();
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          const atual = input.dataset.cents || '0';
          input.dataset.cents = atual.length > 1 ? atual.slice(0, -1) : '0';
          redraw();
        } else if (['Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'Shift'].includes(e.key)) {
          // permite navegação normal
        } else {
          e.preventDefault();
        }
      });
      redraw();
    },

    valorMascaraMoeda(input) {
      return (parseInt(input.dataset.cents || '0', 10)) / 100;
    },

    definirValorMascaraMoeda(input, valor) {
      const cents = Math.round((Number(valor) || 0) * 100);
      input.dataset.cents = String(cents);
      input.value = cents === 0 ? '' : Util.formatMoeda(cents / 100);
    },

    ligarMaiusculas(input) {
      input.addEventListener('input', () => {
        const pos = input.selectionStart;
        input.value = input.value.toUpperCase();
        input.setSelectionRange(pos, pos);
      });
    },

    ligarMascaraData(input) {
      input.addEventListener('input', () => {
        input.value = Util.aplicarMascaraData(input.value);
      });
    },

    // liga Enter para navegar entre campos de um container; ao dar Enter no
    // último campo, chama aoFinalizar()
    ligarNavegacaoEnter(container, aoFinalizar) {
      const campos = Array.from(container.querySelectorAll('.campo-nav'));
      campos.forEach((campo, i) => {
        campo.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (i < campos.length - 1) {
            campos[i + 1].focus();
            if (campos[i + 1].select) campos[i + 1].select();
          } else {
            aoFinalizar();
          }
        });
      });
    },

    escapeHtml(str) {
      const d = document.createElement('div');
      d.textContent = String(str == null ? '' : str);
      return d.innerHTML;
    },

    toast(msg = 'SALVO ✓', tipo = 'ok') {
      let el = document.getElementById('mf-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'mf-toast';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.className = 'mf-toast mf-toast--' + tipo + ' mf-toast--visivel';
      clearTimeout(el._timer);
      el._timer = setTimeout(() => el.classList.remove('mf-toast--visivel'), 2000);
    }
  };

  // ------------------------------------------------------------------------
  // LANÇAMENTOS (entradas / saídas)
  // ------------------------------------------------------------------------

  async function salvarLancamento(obj) {
    const registro = Object.assign({}, obj);
    registro.data = brParaISO(registro.data);
    registro.data_limite = registro.data_limite ? brParaISO(registro.data_limite) : null;
    return gravar('lancamentos', registro);
  }

  async function excluirLancamento(id) {
    return apagar('lancamentos', id);
  }

  function normalizarLancamento(l) {
    return Object.assign({}, l, {
      data: isoParaBR(l.data),
      data_limite: l.data_limite ? isoParaBR(l.data_limite) : null,
    });
  }

  async function buscarLancamentoPorId(id) {
    const uidAtual = await uid();
    const data = await executar(
      sb.from('lancamentos').select('*').eq('user_id', uidAtual).eq('id', id).maybeSingle()
    );
    return data ? normalizarLancamento(data) : undefined;
  }

  async function buscarPorMesAno(mes, ano) {
    const uidAtual = await uid();
    const todos = await executar(
      sb.from('lancamentos').select('*')
        .eq('user_id', uidAtual).eq('ano', ano).eq('mes', mes)
        .order('created_at', { ascending: true })
    ) || [];
    const norm = todos.map(normalizarLancamento);
    return {
      entradas: norm.filter(l => l.tipo === 'entrada'),
      saidas: norm.filter(l => l.tipo === 'saida'),
    };
  }

  async function buscarSaidasPorSituacao(situacao, mes, ano) {
    const { saidas } = await buscarPorMesAno(mes, ano);
    return saidas.filter(s => s.situacao === situacao);
  }

  async function buscarAnosDisponiveis() {
    const uidAtual = await uid();
    const [lancs, hist] = await Promise.all([
      executar(sb.from('lancamentos').select('ano').eq('user_id', uidAtual)),
      executar(sb.from('historico_anual').select('ano').eq('user_id', uidAtual)),
    ]);
    const anos = new Set();
    (lancs || []).forEach(l => anos.add(l.ano));
    (hist || []).forEach(h => anos.add(h.ano));
    anos.add(new Date().getFullYear());
    return Array.from(anos).sort((a, b) => b - a);
  }

  // ------------------------------------------------------------------------
  // HISTÓRICO ANUAL — agrega lançamentos reais e complementa com registros
  // manuais (para anos/meses sem lançamentos detalhados). O `saldo` é
  // derivado aqui; não existe coluna `saldo` no banco.
  // ------------------------------------------------------------------------

  async function salvarHistoricoAnualManual(obj) {
    const linha = apenasColunas(obj, 'historico_anual');
    linha.user_id = await uid();
    return executar(
      sb.from('historico_anual').upsert(linha, { onConflict: 'user_id,ano,mes' }).select('id').single()
    );
  }

  async function buscarHistoricoAnual(ano) {
    const uidAtual = await uid();
    const [lancs, manuais] = await Promise.all([
      executar(sb.from('lancamentos').select('*').eq('user_id', uidAtual).eq('ano', ano)),
      executar(sb.from('historico_anual').select('*').eq('user_id', uidAtual).eq('ano', ano)),
    ]);

    const listaLancs = lancs || [];
    const listaManuais = manuais || [];
    const meses = [];
    for (let mes = 1; mes <= 12; mes++) {
      const doMes = listaLancs.filter(l => l.mes === mes);
      const temLancamentos = doMes.length > 0;
      let total_entradas = 0, total_saidas = 0, total_aberto = 0;

      if (temLancamentos) {
        doMes.forEach(l => {
          const valorEfetivo = (l.valor_pago != null ? l.valor_pago : l.valor) || 0;
          if (l.tipo === 'entrada') {
            total_entradas += l.valor || 0;
          } else {
            if (l.situacao === 'atrasada' || l.situacao === 'urgente') total_aberto += valorEfetivo;
            else total_saidas += valorEfetivo;
          }
        });
      } else {
        const manual = listaManuais.find(m => m.mes === mes);
        if (manual) {
          total_entradas = manual.total_entradas || 0;
          total_saidas = manual.total_saidas || 0;
          total_aberto = manual.total_aberto || 0;
        }
      }

      meses.push({
        ano, mes,
        total_entradas, total_saidas, total_aberto,
        saldo: total_entradas - total_saidas,
        origem: temLancamentos ? 'lancamentos' : (listaManuais.find(m => m.mes === mes) ? 'manual' : 'vazio')
      });
    }
    return meses;
  }

  // ------------------------------------------------------------------------
  // CONFIGURAÇÕES
  //   - `logo_url` é dado real do usuário e sincroniza (tabela configuracoes)
  //   - preferências puramente locais de tela (ex.: ordenar_situacao) ficam
  //     no localStorage deste navegador; não vale a pena um round-trip nem
  //     uma coluna nova pra elas.
  // ------------------------------------------------------------------------

  const CONFIG_SINCRONIZADAS = ['logo_url', 'senha_trocada', 'plano', 'plano_expira'];

  async function salvarConfiguracao(chave, valor) {
    if (CONFIG_SINCRONIZADAS.includes(chave)) {
      const uidAtual = await uid();
      return executar(
        sb.from('configuracoes').upsert({ user_id: uidAtual, [chave]: valor }, { onConflict: 'user_id' }).select('id').single()
      );
    }
    try { localStorage.setItem('mf_cfg_' + chave, JSON.stringify(valor)); } catch (_) { /* modo privado / storage cheio */ }
  }

  async function buscarConfiguracao(chave, padrao = null) {
    if (CONFIG_SINCRONIZADAS.includes(chave)) {
      const uidAtual = await uid();
      const linha = await executar(
        sb.from('configuracoes').select(chave).eq('user_id', uidAtual).maybeSingle()
      );
      return linha && linha[chave] != null ? linha[chave] : padrao;
    }
    try {
      const bruto = localStorage.getItem('mf_cfg_' + chave);
      return bruto == null ? padrao : JSON.parse(bruto);
    } catch (_) {
      return padrao;
    }
  }

  // ------------------------------------------------------------------------
  // CARTÕES DE CRÉDITO
  // ------------------------------------------------------------------------

  async function salvarCartao(obj) {
    const registro = Object.assign({}, obj);
    // a coluna `vencimento` é NOT NULL com CHECK (1..31); a UI pode mandar
    // vazio/NaN — normaliza pra um dia válido.
    const venc = parseInt(registro.vencimento, 10);
    registro.vencimento = (venc >= 1 && venc <= 31) ? venc : 1;
    return gravar('cartoes', registro);
  }

  async function excluirCartao(id) {
    // desvincula saídas que apontavam pra este cartão (a FK já faria SET NULL,
    // mas a situação "cartao" precisa voltar pra "emdia" na mão)
    const uidAtual = await uid();
    await executar(
      sb.from('lancamentos')
        .update({ situacao: 'emdia', cartao_vinculado_id: null })
        .eq('user_id', uidAtual).eq('cartao_vinculado_id', id)
    );
    await executar(sb.from('gastos_cartao').delete().eq('cartao_id', id));
    return apagar('cartoes', id);
  }

  async function buscarCartaoPorId(id) {
    const uidAtual = await uid();
    return executar(sb.from('cartoes').select('*').eq('user_id', uidAtual).eq('id', id).maybeSingle());
  }

  async function buscarCartoes(mes, ano) {
    const uidAtual = await uid();
    const todos = await executar(
      sb.from('cartoes').select('*')
        .eq('user_id', uidAtual).eq('mes', mes).eq('ano', ano)
        .order('nome', { ascending: true })
    );
    return todos || [];
  }

  // ------------------------------------------------------------------------
  // GASTOS DO CARTÃO
  //   coluna no banco: `tipo_cobranca` ('avista' | 'juros')
  //   campo usado pela UI: `tipo`
  // ------------------------------------------------------------------------

  async function salvarGastoCartao(obj) {
    const registro = Object.assign({}, obj);
    registro.tipo_cobranca = registro.tipo_cobranca || registro.tipo;
    return gravar('gastos_cartao', registro);
  }

  async function excluirGastoCartao(id) {
    return apagar('gastos_cartao', id);
  }

  async function buscarGastosPorCartao(cartao_id, mes, ano) {
    const uidAtual = await uid();
    const todos = await executar(
      sb.from('gastos_cartao').select('*')
        .eq('user_id', uidAtual).eq('cartao_id', cartao_id).eq('mes', mes).eq('ano', ano)
        .order('created_at', { ascending: true })
    );
    return (todos || []).map(g => Object.assign({}, g, { tipo: g.tipo_cobranca }));
  }

  async function calcularJurosTotais(mes, ano) {
    const cartoes = await buscarCartoes(mes, ano);
    let totalJuros = 0, totalSemJuros = 0, totalGastosCartao = 0, faturaTotal = 0;

    for (const cartao of cartoes) {
      const gastos = await buscarGastosPorCartao(cartao.id, mes, ano);
      gastos.forEach(g => {
        totalGastosCartao += g.valor_total || 0;
        if (g.tipo === 'juros') totalJuros += g.valor_juros || 0;
        else totalSemJuros += g.valor_total || 0;
      });
      faturaTotal += cartao.fatura_atual || 0;
    }
    // saídas de lançamentos pagas com cartão também contam pro total geral em cartões
    const { saidas } = await buscarPorMesAno(mes, ano);
    saidas.filter(s => s.situacao === 'cartao')
      .forEach(s => { totalGastosCartao += (s.valor_pago != null ? s.valor_pago : s.valor) || 0; });

    const entradas = (await buscarPorMesAno(mes, ano)).entradas.reduce((s, e) => s + (e.valor || 0), 0);
    const percentualFatura = faturaTotal > 0 ? (totalJuros / faturaTotal) * 100 : 0;
    const percentualRenda = entradas > 0 ? (totalJuros / entradas) * 100 : 0;

    return { totalJuros, totalSemJuros, totalGastosCartao, faturaTotal, percentualFatura, percentualRenda };
  }

  async function vincularSaidaAoCartao(saida_id, cartao_id, valor) {
    const lanc = await buscarLancamentoPorId(saida_id);
    if (!lanc) throw new Error('Lançamento não encontrado: ' + saida_id);
    lanc.situacao = 'cartao';
    lanc.cartao_vinculado_id = cartao_id;
    lanc.valor_pago = valor;
    return salvarLancamento(lanc);
  }

  // ------------------------------------------------------------------------
  // BACKUP — exporta/importa todas as tabelas da conta. O backup em si pode
  // ser opcionalmente cifrado (AES-GCM) por app.js antes de baixar.
  // ------------------------------------------------------------------------

  const TABELAS_BACKUP = ['lancamentos', 'historico_anual', 'configuracoes', 'cartoes', 'gastos_cartao'];

  async function exportarTudo() {
    const uidAtual = await uid();
    const partes = await Promise.all(
      TABELAS_BACKUP.map(t => executar(sb.from(t).select('*').eq('user_id', uidAtual)))
    );
    const saida = { versao: 2, exportado_em: new Date().toISOString() };
    TABELAS_BACKUP.forEach((t, i) => { saida[t] = partes[i] || []; });
    return saida;
  }

  async function importarBackup(json) {
    if (!json || typeof json !== 'object') throw new Error('Backup inválido');
    if (json.versao === 1) {
      throw new Error('Este backup é da versão offline antiga (versão 1) e não é compatível com a conta online.');
    }
    const uidAtual = await uid();

    // apaga primeiro as tabelas "filhas" (respeitando as FKs), depois recria
    for (const t of ['gastos_cartao', 'lancamentos', 'historico_anual', 'configuracoes', 'cartoes']) {
      await executar(sb.from(t).delete().eq('user_id', uidAtual));
    }

    const inserir = async (t, linhas) => {
      if (!linhas || !linhas.length) return;
      const comDono = linhas.map(l => Object.assign({}, l, { user_id: uidAtual }));
      await executar(sb.from(t).upsert(comDono));
    };

    await inserir('cartoes', json.cartoes);
    await inserir('lancamentos', json.lancamentos);
    await inserir('gastos_cartao', json.gastos_cartao);
    await inserir('historico_anual', json.historico_anual);
    await inserir('configuracoes', json.configuracoes);
    return true;
  }

  // ------------------------------------------------------------------------
  // CRIPTOGRAFIA DE BACKUP (AES-GCM 256 bits, chave derivada da senha via
  // PBKDF2) — usada pela exportação/restauração opcionalmente cifrada.
  // ------------------------------------------------------------------------

  async function derivarChaveBackup(senha, salt) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function cifrarBackup(objeto, senha) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const chave = await derivarChaveBackup(senha, salt);
    const dados = new TextEncoder().encode(JSON.stringify(objeto));
    const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, dados));
    // formato binário simples: [salt 16 bytes][iv 12 bytes][ciphertext...]
    const saida = new Uint8Array(salt.length + iv.length + cifrado.length);
    saida.set(salt, 0);
    saida.set(iv, salt.length);
    saida.set(cifrado, salt.length + iv.length);
    return saida;
  }

  async function decifrarBackup(bytes, senha) {
    const dadosBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const salt = dadosBytes.slice(0, 16);
    const iv = dadosBytes.slice(16, 28);
    const cifrado = dadosBytes.slice(28);
    const chave = await derivarChaveBackup(senha, salt);
    const decifrado = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, chave, cifrado);
    return JSON.parse(new TextDecoder().decode(decifrado));
  }

  Util.cifrarBackup = cifrarBackup;
  Util.decifrarBackup = decifrarBackup;

  // ------------------------------------------------------------------------
  // SESSÃO — a autenticação real vive em supabase-auth.js (window.MFAuth).
  // `exigirPin` mantém o nome antigo por compatibilidade com app.js /
  // relatorio.js / historico.js, mas hoje só confere se há sessão Supabase
  // ativa (o route-guard.js já redireciona antes; isto é a segunda camada).
  // ------------------------------------------------------------------------

  const Auth = {
    exigirPin: () => window.MFAuth.requireSession(),
    sair: () => window.MFAuth.signOut(),
  };

  // Liga o link "Sair" do cabeçalho em qualquer uma das páginas internas.
  document.addEventListener('DOMContentLoaded', () => {
    const link = document.getElementById('link-sair');
    if (link) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        Auth.sair();
      });
    }
  });

  return {
    // compat: algumas rotinas antigas chamavam isto antes de tudo
    abrirBanco: async () => true,
    Util,
    salvarLancamento, excluirLancamento, buscarLancamentoPorId, buscarPorMesAno,
    buscarSaidasPorSituacao, buscarAnosDisponiveis,
    salvarHistoricoAnualManual, buscarHistoricoAnual,
    salvarConfiguracao, buscarConfiguracao,
    salvarCartao, excluirCartao, buscarCartaoPorId, buscarCartoes,
    salvarGastoCartao, excluirGastoCartao, buscarGastosPorCartao,
    calcularJurosTotais, vincularSaidaAoCartao,
    exportarTudo, importarBackup,
    Auth,
  };
})();
