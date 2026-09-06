/* ==========================================================================
   MEU FINANCEIRO — relatorio.js (Módulo 2: relatório analítico)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.pagina !== 'relatorio') return;
  initRelatorio();
});

let relPeriodo = MF.Util.mesAnoAtual();
let graficos = {};

function destruirGrafico(chave) {
  if (graficos[chave]) { graficos[chave].destroy(); delete graficos[chave]; }
}

async function initRelatorio() {
  popularSeletoresRelatorio();
  document.getElementById('rel-sel-mes').addEventListener('change', onMudarPeriodoRelatorio);
  document.getElementById('rel-sel-ano').addEventListener('change', onMudarPeriodoRelatorio);
  document.getElementById('btn-exportar-xlsx').addEventListener('click', () => exportarComFeedback('btn-exportar-xlsx', () => MF.Exportar.gerarXLSX(relPeriodo)));
  document.getElementById('btn-exportar-pdf').addEventListener('click', () => exportarComFeedback('btn-exportar-pdf', () => MF.Exportar.gerarPDF(relPeriodo)));
  await carregarRelatorio();
}

function popularSeletoresRelatorio() {
  const selMes = document.getElementById('rel-sel-mes');
  const selAno = document.getElementById('rel-sel-ano');
  selMes.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const op = document.createElement('option');
    op.value = m; op.textContent = MF.Util.nomeMes(m);
    if (m === relPeriodo.mes) op.selected = true;
    selMes.appendChild(op);
  }
  selAno.innerHTML = '';
  const anoAtual = new Date().getFullYear();
  for (let a = anoAtual - 3; a <= anoAtual + 1; a++) {
    const op = document.createElement('option');
    op.value = a; op.textContent = a;
    if (a === relPeriodo.ano) op.selected = true;
    selAno.appendChild(op);
  }
}

function onMudarPeriodoRelatorio() {
  relPeriodo = { mes: parseInt(document.getElementById('rel-sel-mes').value, 10), ano: parseInt(document.getElementById('rel-sel-ano').value, 10) };
  carregarRelatorio();
}

async function carregarRelatorio() {
  const { mes, ano } = relPeriodo;
  const { entradas, saidas } = await MF.buscarPorMesAno(mes, ano);
  const historico = await MF.buscarHistoricoAnual(ano);
  const projecao = await MF.Previsao.calcularProjecao(ano);
  const jurosInfo = await MF.calcularJurosTotais(mes, ano);

  renderPainelEntradas(entradas);
  renderPainelSaidas(saidas, historico);
  renderCurvaPrevisao(projecao);
  renderVariacaoMensal(historico);
  renderNarrativa({ mes, ano, entradas, saidas, projecao, jurosInfo });
}

// --------------------------------------------------------------- SEÇÃO A: ENTRADAS

function renderPainelEntradas(entradas) {
  const total = entradas.reduce((s, e) => s + (e.valor || 0), 0);
  const corpo = document.getElementById('tabela-entradas-corpo');
  corpo.innerHTML = entradas.length ? entradas.map(e => `
    <tr>
      <td data-rotulo="Descrição">${MF.Util.escapeHtml(e.descricao)}</td>
      <td data-rotulo="Origem">${MF.Util.escapeHtml(e.origem)}</td>
      <td data-rotulo="Valor" class="col-valor">${MF.Util.formatMoeda(e.valor)}</td>
      <td data-rotulo="%" class="col-percent">${MF.Util.formatPercent(total ? e.valor / total * 100 : 0)}</td>
      <td data-rotulo="Data" class="col-data">${e.data || ''}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="txt-muted">Nenhuma entrada neste período.</td></tr>';

  const porOrigem = {};
  entradas.forEach(e => { porOrigem[e.origem] = (porOrigem[e.origem] || 0) + e.valor; });
  const origens = Object.entries(porOrigem).sort((a, b) => b[1] - a[1]);

  document.getElementById('tabela-entradas-origem-corpo').innerHTML = origens.length ? origens.map(([o, v]) => `
    <tr><td data-rotulo="Origem">${MF.Util.escapeHtml(o)}</td><td data-rotulo="Valor" class="col-valor">${MF.Util.formatMoeda(v)}</td><td data-rotulo="%" class="col-percent">${MF.Util.formatPercent(total ? v / total * 100 : 0)}</td></tr>
  `).join('') : '<tr><td colspan="3" class="txt-muted">Sem dados.</td></tr>';

  destruirGrafico('pizza');
  graficos.pizza = new Chart(document.getElementById('grafico-pizza-origem'), {
    type: 'pie',
    data: { labels: origens.map(o => o[0]), datasets: [{ data: origens.map(o => o[1]), backgroundColor: MF.PALETA }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });

  carregarGraficoEntradasPorMes();
}

async function carregarGraficoEntradasPorMes() {
  const historico = await MF.buscarHistoricoAnual(relPeriodo.ano);
  destruirGrafico('barrasEntradasMes');
  graficos.barrasEntradasMes = new Chart(document.getElementById('grafico-barras-entradas-mes'), {
    type: 'bar',
    data: { labels: historico.map(h => MF.Util.nomeMes(h.mes, true)), datasets: [{ label: 'Entradas', data: historico.map(h => h.total_entradas), backgroundColor: '#4a90d9' }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

// --------------------------------------------------------------- SEÇÃO B: SAÍDAS

function renderPainelSaidas(saidas, historico) {
  const total = saidas.reduce((s, x) => s + valorEfetivoSaida(x), 0);
  const corpo = document.getElementById('tabela-saidas-corpo');
  corpo.innerHTML = saidas.length ? saidas.map(s => `
    <tr>
      <td data-rotulo="Descrição">${MF.Util.escapeHtml(s.descricao)}</td>
      <td data-rotulo="Origem">${MF.Util.escapeHtml(s.origem)}</td>
      <td data-rotulo="Valor" class="col-valor">${MF.Util.formatMoeda(valorEfetivoSaida(s))}</td>
      <td data-rotulo="Situação">${MF.Situacoes[s.situacao] ? MF.Situacoes[s.situacao].icone + ' ' + MF.Situacoes[s.situacao].rotulo : '-'}</td>
      <td data-rotulo="%" class="col-percent">${MF.Util.formatPercent(total ? valorEfetivoSaida(s) / total * 100 : 0)}</td>
      <td data-rotulo="Data" class="col-data">${s.data || ''}</td>
    </tr>`).join('') : '<tr><td colspan="6" class="txt-muted">Nenhuma saída neste período.</td></tr>';

  const porOrigem = {};
  saidas.forEach(s => { porOrigem[s.origem] = (porOrigem[s.origem] || 0) + valorEfetivoSaida(s); });
  const origens = Object.entries(porOrigem).sort((a, b) => b[1] - a[1]);
  document.getElementById('tabela-saidas-categoria-corpo').innerHTML = origens.length ? origens.map(([o, v]) => `
    <tr><td data-rotulo="Categoria">${MF.Util.escapeHtml(o)}</td><td data-rotulo="Valor" class="col-valor">${MF.Util.formatMoeda(v)}</td><td data-rotulo="%" class="col-percent">${MF.Util.formatPercent(total ? v / total * 100 : 0)}</td></tr>
  `).join('') : '<tr><td colspan="3" class="txt-muted">Sem dados.</td></tr>';

  destruirGrafico('barrasSaidasStatus');
  graficos.barrasSaidasStatus = new Chart(document.getElementById('grafico-barras-saidas-status'), {
    type: 'bar',
    data: {
      labels: historico.map(h => MF.Util.nomeMes(h.mes, true)),
      datasets: [
        { label: 'Pagas', data: historico.map(h => h.total_saidas), backgroundColor: '#27ae60' },
        { label: 'Em Aberto', data: historico.map(h => h.total_aberto), backgroundColor: '#e74c3c' }
      ]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
  });

  const tendencia = calcularTendencia(historico);
  const elTend = document.getElementById('indicador-tendencia');
  elTend.className = tendencia.classe;
  elTend.textContent = `Tendência das saídas: ${tendencia.seta} ${tendencia.texto}`;
}

function calcularTendencia(historico) {
  const comDados = historico.filter(h => h.origem !== 'vazio');
  if (comDados.length < 2) return { seta: '→', texto: 'dados insuficientes', classe: 'txt-muted' };
  const atual = comDados[comDados.length - 1];
  const anterior = comDados[comDados.length - 2];
  const atualSai = atual.total_saidas + atual.total_aberto;
  const anteriorSai = anterior.total_saidas + anterior.total_aberto;
  if (!anteriorSai) return { seta: '→', texto: 'estável', classe: 'txt-muted' };
  const delta = (atualSai - anteriorSai) / anteriorSai * 100;
  if (Math.abs(delta) < 1) return { seta: '→', texto: `estável (${MF.Util.formatPercent(delta)})`, classe: 'txt-muted' };
  return delta > 0
    ? { seta: '↑', texto: `subindo (${MF.Util.formatPercent(delta)})`, classe: 'txt-vermelho' }
    : { seta: '↓', texto: `descendo (${MF.Util.formatPercent(Math.abs(delta))})`, classe: 'txt-verde' };
}

// --------------------------------------------------------------- SEÇÃO C: PREVISÃO

function renderCurvaPrevisao(projecao) {
  destruirGrafico('previsao');
  graficos.previsao = new Chart(document.getElementById('grafico-previsao'), {
    type: 'line',
    data: {
      labels: projecao.map(p => MF.Util.nomeMes(p.mes, true)),
      datasets: [
        { label: 'Entradas', data: projecao.map(p => p.entrada), borderColor: '#27ae60', backgroundColor: '#27ae60', tension: .25, fill: false },
        {
          label: 'Zona de Risco', data: projecao.map(p => Math.max(p.previsto, p.entrada)),
          borderWidth: 0, pointRadius: 0, backgroundColor: 'rgba(231,76,60,0.18)', fill: 0, order: 3
        },
        { label: 'Previsão de Saídas', data: projecao.map(p => p.previsto), borderColor: '#e74c3c88', backgroundColor: '#e74c3c', borderDash: [6, 4], tension: .25, fill: false, pointRadius: 3 },
        { label: 'Saídas Reais', data: projecao.map(p => p.real), borderColor: '#e74c3c', backgroundColor: '#e74c3c', tension: .25, fill: false }
      ]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } }, interaction: { intersect: false, mode: 'index' } }
  });
}

// --------------------------------------------------------------- SEÇÃO D: VARIAÇÃO MENSAL

function renderVariacaoMensal(historico) {
  document.getElementById('rotulo-ano-variacao').textContent = relPeriodo.ano;
  const linhas = historico.map((h, i) => {
    const ant = i > 0 ? historico[i - 1] : null;
    const saiAtual = h.total_saidas + h.total_aberto;
    const saiAnt = ant ? ant.total_saidas + ant.total_aberto : 0;
    const varEnt = ant && ant.total_entradas ? ((h.total_entradas - ant.total_entradas) / ant.total_entradas * 100) : null;
    const varSai = ant && saiAnt ? ((saiAtual - saiAnt) / saiAnt * 100) : null;
    return { mes: h.mes, entradas: h.total_entradas, saidas: saiAtual, varEnt, varSai };
  });

  document.getElementById('tabela-variacao-corpo').innerHTML = linhas.map(l => `
    <tr>
      <td data-rotulo="Mês">${MF.Util.nomeMes(l.mes)}</td>
      <td data-rotulo="Entradas" class="col-valor">${MF.Util.formatMoeda(l.entradas)}</td>
      <td data-rotulo="Var. Entradas" class="col-percent ${l.varEnt == null ? 'txt-muted' : (l.varEnt >= 0 ? 'txt-verde' : 'txt-vermelho')}">${l.varEnt == null ? '-' : MF.Util.formatPercent(l.varEnt)}</td>
      <td data-rotulo="Saídas" class="col-valor">${MF.Util.formatMoeda(l.saidas)}</td>
      <td data-rotulo="Var. Saídas" class="col-percent ${l.varSai == null ? 'txt-muted' : (l.varSai <= 0 ? 'txt-verde' : 'txt-vermelho')}">${l.varSai == null ? '-' : MF.Util.formatPercent(l.varSai)}</td>
    </tr>`).join('');
}

// --------------------------------------------------------------- SEÇÃO E: NARRATIVA

function renderNarrativa({ mes, ano, entradas, saidas, projecao, jurosInfo }) {
  const totalEnt = entradas.reduce((s, e) => s + (e.valor || 0), 0);
  const partes = [
    MF.Narrativa.gerarNarrativaMensal({ mes, ano, entradas, saidas, projecao }),
    MF.Narrativa.gerarNarrativaRisco({ saidas, totalEntradas: totalEnt }),
    MF.Narrativa.gerarNarrativaJuros({ jurosInfo })
  ].filter(Boolean);
  document.getElementById('narrativa-container').innerHTML = partes.map(p => `<p>${MF.Util.escapeHtml(p)}</p>`).join('');
}
