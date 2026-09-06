/* ==========================================================================
   MEU FINANCEIRO — camada de dados (IndexedDB) + utilitários compartilhados
   Carregado por index.html, relatorio.html e historico.html antes dos
   scripts específicos de cada página (app.js / relatorio.js / historico.js).
   ========================================================================== */

const MF = (() => {

  const DB_NAME = 'MeuFinanceiroDB';
  const DB_VERSION = 1;
  let dbInstance = null;

  function abrirBanco() {
    if (dbInstance) return Promise.resolve(dbInstance);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;

        if (!db.objectStoreNames.contains('lancamentos')) {
          const s = db.createObjectStore('lancamentos', { keyPath: 'id', autoIncrement: true });
          s.createIndex('ano', 'ano');
          s.createIndex('mes', 'mes');
          s.createIndex('tipo', 'tipo');
          s.createIndex('origem', 'origem');
          s.createIndex('situacao', 'situacao');
          s.createIndex('ano_mes', ['ano', 'mes']);
          s.createIndex('ano_mes_tipo', ['ano', 'mes', 'tipo']);
          s.createIndex('cartao_vinculado_id', 'cartao_vinculado_id');
        }

        if (!db.objectStoreNames.contains('historico_anual')) {
          const s = db.createObjectStore('historico_anual', { keyPath: ['ano', 'mes'] });
          s.createIndex('ano', 'ano');
        }

        if (!db.objectStoreNames.contains('configuracoes')) {
          db.createObjectStore('configuracoes', { keyPath: 'chave' });
        }

        if (!db.objectStoreNames.contains('cartoes')) {
          const s = db.createObjectStore('cartoes', { keyPath: 'id', autoIncrement: true });
          s.createIndex('ano_mes', ['ano', 'mes']);
        }

        if (!db.objectStoreNames.contains('gastos_cartao')) {
          const s = db.createObjectStore('gastos_cartao', { keyPath: 'id', autoIncrement: true });
          s.createIndex('cartao_id', 'cartao_id');
          s.createIndex('ano_mes', ['ano', 'mes']);
        }
      };

      req.onsuccess = (ev) => { dbInstance = ev.target.result; resolve(dbInstance); };
      req.onerror = (ev) => reject(ev.target.error);
    });
  }

  function promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getStore(nome, modo = 'readonly') {
    const db = await abrirBanco();
    const tx = db.transaction(nome, modo);
    return tx.objectStore(nome);
  }

  async function getAllByIndex(storeNome, indexNome, valorChave) {
    const store = await getStore(storeNome);
    const idx = store.index(indexNome);
    return promisify(idx.getAll(valorChave));
  }

  async function getAll(storeNome) {
    const store = await getStore(storeNome);
    return promisify(store.getAll());
  }

  // ------------------------------------------------------------------------
  // Utilitários de formatação / máscara (compartilhados por todas as páginas)
  // ------------------------------------------------------------------------

  const NOMES_MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
    'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  const NOMES_MESES_ABREV = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

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
    const store = await getStore('lancamentos', 'readwrite');
    const registro = Object.assign({ criado_em: new Date().toISOString() }, obj);
    return promisify(store.put(registro));
  }

  async function excluirLancamento(id) {
    const store = await getStore('lancamentos', 'readwrite');
    return promisify(store.delete(id));
  }

  async function buscarLancamentoPorId(id) {
    const store = await getStore('lancamentos');
    return promisify(store.get(id));
  }

  async function buscarPorMesAno(mes, ano) {
    const todos = await getAllByIndex('lancamentos', 'ano_mes', [ano, mes]);
    return {
      entradas: todos.filter(l => l.tipo === 'entrada').sort((a, b) => (a.criado_em || '').localeCompare(b.criado_em || '')),
      saidas: todos.filter(l => l.tipo === 'saida').sort((a, b) => (a.criado_em || '').localeCompare(b.criado_em || ''))
    };
  }

  async function buscarSaidasPorSituacao(situacao, mes, ano) {
    const { saidas } = await buscarPorMesAno(mes, ano);
    return saidas.filter(s => s.situacao === situacao);
  }

  async function buscarAnosDisponiveis() {
    const [lancs, hist] = await Promise.all([getAll('lancamentos'), getAll('historico_anual')]);
    const anos = new Set();
    lancs.forEach(l => anos.add(l.ano));
    hist.forEach(h => anos.add(h.ano));
    anos.add(new Date().getFullYear());
    return Array.from(anos).sort((a, b) => b - a);
  }

  // ------------------------------------------------------------------------
  // HISTÓRICO ANUAL — agrega lançamentos reais e complementa com registros
  // manuais (para anos/meses sem lançamentos detalhados)
  // ------------------------------------------------------------------------

  async function salvarHistoricoAnualManual(obj) {
    const store = await getStore('historico_anual', 'readwrite');
    return promisify(store.put(obj));
  }

  async function buscarHistoricoAnual(ano) {
    const [lancs, manuais] = await Promise.all([
      getAllByIndex('lancamentos', 'ano', ano),
      getAllByIndex('historico_anual', 'ano', ano)
    ]);

    const meses = [];
    for (let mes = 1; mes <= 12; mes++) {
      const doMes = lancs.filter(l => l.mes === mes);
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
        const manual = manuais.find(m => m.mes === mes);
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
        origem: temLancamentos ? 'lancamentos' : (manuais.find(m => m.mes === mes) ? 'manual' : 'vazio')
      });
    }
    return meses;
  }

  // ------------------------------------------------------------------------
  // CONFIGURAÇÕES
  // ------------------------------------------------------------------------

  async function salvarConfiguracao(chave, valor) {
    const store = await getStore('configuracoes', 'readwrite');
    return promisify(store.put({ chave, valor }));
  }

  async function buscarConfiguracao(chave, padrao = null) {
    const store = await getStore('configuracoes');
    const r = await promisify(store.get(chave));
    return r ? r.valor : padrao;
  }

  // ------------------------------------------------------------------------
  // CARTÕES DE CRÉDITO
  // ------------------------------------------------------------------------

  async function salvarCartao(obj) {
    const store = await getStore('cartoes', 'readwrite');
    return promisify(store.put(obj));
  }

  async function excluirCartao(id) {
    const gastos = await getAllByIndex('gastos_cartao', 'cartao_id', id);
    const storeGastos = await getStore('gastos_cartao', 'readwrite');
    await Promise.all(gastos.map(g => promisify(storeGastos.delete(g.id))));

    const lancs = await getAllByIndex('lancamentos', 'cartao_vinculado_id', id);
    const storeLanc = await getStore('lancamentos', 'readwrite');
    await Promise.all(lancs.map(l => {
      l.cartao_vinculado_id = null;
      if (l.situacao === 'cartao') l.situacao = 'emdia';
      return promisify(storeLanc.put(l));
    }));

    const store = await getStore('cartoes', 'readwrite');
    return promisify(store.delete(id));
  }

  async function buscarCartaoPorId(id) {
    const store = await getStore('cartoes');
    return promisify(store.get(id));
  }

  async function buscarCartoes(mes, ano) {
    const todos = await getAll('cartoes');
    return todos.filter(c => c.mes === mes && c.ano === ano)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }

  // ------------------------------------------------------------------------
  // GASTOS DO CARTÃO
  // ------------------------------------------------------------------------

  async function salvarGastoCartao(obj) {
    const store = await getStore('gastos_cartao', 'readwrite');
    return promisify(store.put(obj));
  }

  async function excluirGastoCartao(id) {
    const store = await getStore('gastos_cartao', 'readwrite');
    return promisify(store.delete(id));
  }

  async function buscarGastosPorCartao(cartao_id, mes, ano) {
    const todos = await getAllByIndex('gastos_cartao', 'cartao_id', cartao_id);
    return todos.filter(g => g.mes === mes && g.ano === ano)
      .sort((a, b) => (a.id || 0) - (b.id || 0));
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
    const saidasCartao = saidas.filter(s => s.situacao === 'cartao');
    saidasCartao.forEach(s => { totalGastosCartao += (s.valor_pago != null ? s.valor_pago : s.valor) || 0; });

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
  // BACKUP
  // ------------------------------------------------------------------------

  async function exportarTudo() {
    const [lancamentos, historico_anual, configuracoes, cartoes, gastos_cartao] = await Promise.all([
      getAll('lancamentos'), getAll('historico_anual'), getAll('configuracoes'),
      getAll('cartoes'), getAll('gastos_cartao')
    ]);
    return {
      versao: DB_VERSION,
      exportado_em: new Date().toISOString(),
      lancamentos, historico_anual, configuracoes, cartoes, gastos_cartao
    };
  }

  async function importarBackup(json) {
    if (!json || typeof json !== 'object') throw new Error('Backup inválido');
    const stores = ['lancamentos', 'historico_anual', 'configuracoes', 'cartoes', 'gastos_cartao'];
    const db = await abrirBanco();
    const tx = db.transaction(stores, 'readwrite');
    for (const nome of stores) {
      const store = tx.objectStore(nome);
      store.clear();
      (json[nome] || []).forEach(item => store.put(item));
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    abrirBanco,
    Util,
    salvarLancamento, excluirLancamento, buscarLancamentoPorId, buscarPorMesAno,
    buscarSaidasPorSituacao, buscarAnosDisponiveis,
    salvarHistoricoAnualManual, buscarHistoricoAnual,
    salvarConfiguracao, buscarConfiguracao,
    salvarCartao, excluirCartao, buscarCartaoPorId, buscarCartoes,
    salvarGastoCartao, excluirGastoCartao, buscarGastosPorCartao,
    calcularJurosTotais, vincularSaidaAoCartao,
    exportarTudo, importarBackup
  };
})();
