/* ==========================================================================
   MEU FINANCEIRO — historico.js (Módulo 3: histórico anual comparativo)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  if (document.body.dataset.pagina !== 'historico') return;
  await MF.Auth.exigirPin();
  initHistorico();
});

let anoSelecionado = new Date().getFullYear();
let graficosHist = {};

function destruirGraficoHist(chave) {
  if (graficosHist[chave]) { graficosHist[chave].destroy(); delete graficosHist[chave]; }
}

async function initHistorico() {
  await popularSeletorAno();
  document.getElementById('sel-ano-historico').addEventListener('change', (e) => {
    anoSelecionado = parseInt(e.target.value, 10);
    carregarAno();
  });
  document.getElementById('btn-registrar-ano').addEventListener('click', abrirModalRegistrarAno);
  document.getElementById('btn-fechar-modal').addEventListener('click', fecharModalRegistrarAno);
  document.getElementById('btn-cancelar-modal').addEventListener('click', fecharModalRegistrarAno);
  document.getElementById('form-registrar-ano').addEventListener('submit', salvarAnoManual);

  await carregarAno();
  await carregarComparativoAnos();
}

async function popularSeletorAno() {
  const anos = await MF.buscarAnosDisponiveis();
  const sel = document.getElementById('sel-ano-historico');
  sel.innerHTML = anos.map(a => `<option value="${a}" ${a === anoSelecionado ? 'selected' : ''}>${a}</option>`).join('');
}

async function carregarAno() {
  const historico = await MF.buscarHistoricoAnual(anoSelecionado);

  destruirGraficoHist('linha');
  graficosHist.linha = new Chart(document.getElementById('grafico-historico-linha'), {
    type: 'line',
    data: {
      labels: historico.map(h => MF.Util.nomeMes(h.mes, true)),
      datasets: [
        { label: 'Entradas', data: historico.map(h => h.total_entradas), borderColor: '#27ae60', backgroundColor: '#27ae60', tension: .25 },
        { label: 'Saídas', data: historico.map(h => h.total_saidas + h.total_aberto), borderColor: '#e74c3c', backgroundColor: '#e74c3c', tension: .25 }
      ]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });

  let totalEnt = 0, totalSai = 0;
  const linhas = historico.map((h, i) => {
    const saiAtual = h.total_saidas + h.total_aberto;
    totalEnt += h.total_entradas; totalSai += saiAtual;
    const ant = i > 0 ? historico[i - 1] : null;
    const saiAnt = ant ? ant.total_saidas + ant.total_aberto : 0;
    const variacao = ant && saiAnt ? ((saiAtual - saiAnt) / saiAnt * 100) : null;
    return { mes: h.mes, entradas: h.total_entradas, saidas: saiAtual, saldo: h.total_entradas - saiAtual, variacao };
  });

  document.getElementById('tabela-historico-corpo').innerHTML = linhas.map(l => `
    <tr>
      <td data-rotulo="Mês">${MF.Util.nomeMes(l.mes)}</td>
      <td data-rotulo="Entradas" class="col-valor">${MF.Util.formatMoeda(l.entradas)}</td>
      <td data-rotulo="Saídas" class="col-valor">${MF.Util.formatMoeda(l.saidas)}</td>
      <td data-rotulo="Saldo" class="col-valor ${l.saldo >= 0 ? 'txt-verde' : 'txt-vermelho'}">${MF.Util.formatMoeda(l.saldo)}</td>
      <td data-rotulo="Variação Saídas" class="col-percent ${l.variacao == null ? 'txt-muted' : (l.variacao <= 0 ? 'txt-verde' : 'txt-vermelho')}">${l.variacao == null ? '-' : MF.Util.formatPercent(l.variacao)}</td>
    </tr>`).join('');

  const saldoAno = totalEnt - totalSai;
  const indicador = document.getElementById('indicador-anual');
  indicador.className = 'indicador-anual ' + (saldoAno >= 0 ? 'superavit' : 'deficit');
  indicador.textContent = `Ano de ${anoSelecionado} ${saldoAno >= 0 ? 'encerrado com SUPERÁVIT' : 'encerrado com DÉFICIT'} de ${MF.Util.formatMoeda(Math.abs(saldoAno))}`;
}

async function carregarComparativoAnos() {
  const anos = (await MF.buscarAnosDisponiveis()).slice().sort((a, b) => a - b);
  const totais = [];
  for (const ano of anos) {
    const historico = await MF.buscarHistoricoAnual(ano);
    const totalEnt = historico.reduce((s, h) => s + h.total_entradas, 0);
    const totalSai = historico.reduce((s, h) => s + h.total_saidas + h.total_aberto, 0);
    totais.push({ ano, totalEnt, totalSai });
  }

  destruirGraficoHist('comparativo');
  graficosHist.comparativo = new Chart(document.getElementById('grafico-comparativo-anos'), {
    type: 'bar',
    data: {
      labels: totais.map(t => t.ano),
      datasets: [
        { label: 'Entradas', data: totais.map(t => t.totalEnt), backgroundColor: '#4a90d9' },
        { label: 'Saídas', data: totais.map(t => t.totalSai), backgroundColor: '#e74c3c' }
      ]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });
}

// ------------------------------------------------------------ MODAL REGISTRAR ANO

function abrirModalRegistrarAno() {
  const corpo = document.getElementById('modal-meses-corpo');
  corpo.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${MF.Util.nomeMes(m)}</td>
      <td><input class="campo campo-modal-valor" data-mes="${m}" data-campo="total_entradas" inputmode="numeric" placeholder="R$ 0,00" /></td>
      <td><input class="campo campo-modal-valor" data-mes="${m}" data-campo="total_saidas" inputmode="numeric" placeholder="R$ 0,00" /></td>
      <td><input class="campo campo-modal-valor" data-mes="${m}" data-campo="total_aberto" inputmode="numeric" placeholder="R$ 0,00" /></td>
    `;
    corpo.appendChild(tr);
  }
  corpo.querySelectorAll('.campo-modal-valor').forEach(inp => MF.Util.ligarMascaraMoeda(inp));
  document.getElementById('modal-ano-input').value = anoSelecionado;
  document.getElementById('modal-registrar-ano').classList.add('aberto');
}

function fecharModalRegistrarAno() {
  document.getElementById('modal-registrar-ano').classList.remove('aberto');
}

async function salvarAnoManual(ev) {
  ev.preventDefault();
  const ano = parseInt(document.getElementById('modal-ano-input').value, 10);
  if (!ano) { MF.Util.toast('INFORME O ANO', 'erro'); return; }

  for (let m = 1; m <= 12; m++) {
    const entradas = MF.Util.valorMascaraMoeda(document.querySelector(`[data-mes="${m}"][data-campo="total_entradas"]`));
    const saidas = MF.Util.valorMascaraMoeda(document.querySelector(`[data-mes="${m}"][data-campo="total_saidas"]`));
    const aberto = MF.Util.valorMascaraMoeda(document.querySelector(`[data-mes="${m}"][data-campo="total_aberto"]`));
    await MF.salvarHistoricoAnualManual({ ano, mes: m, total_entradas: entradas, total_saidas: saidas, total_aberto: aberto, saldo: entradas - saidas });
  }

  MF.Util.toast('ANO REGISTRADO ✓');
  fecharModalRegistrarAno();
  anoSelecionado = ano;
  await popularSeletorAno();
  document.getElementById('sel-ano-historico').value = ano;
  await carregarAno();
  await carregarComparativoAnos();
}
