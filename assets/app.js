/* ==========================================================================
   MEU FINANCEIRO — app.js
   Parte 1: módulos compartilhados anexados a MF (Situações, Previsão,
            Narrativa, Exportar) — usados por index.html E relatorio.html.
   Parte 2: controlador da página de lançamentos (index.html).
   ========================================================================== */

MF.Situacoes = {
  atrasada: { rotulo: 'ATRASADA', icone: '⚠', prioridade: 1 },
  urgente: { rotulo: 'URGENTE', icone: '🔔', prioridade: 2 },
  cartao: { rotulo: 'PAGO C/ CARTÃO', icone: '💳', prioridade: 3 },
  emdia: { rotulo: 'EM DIA', icone: '✓', prioridade: 4 }
};

MF.PALETA = ['#4a90d9', '#27ae60', '#e74c3c', '#e67e22', '#f1c40f', '#9b59b6', '#1abc9c', '#e84393', '#95a5a6'];

function valorEfetivoSaida(s) {
  return (s.valor_pago != null ? s.valor_pago : s.valor) || 0;
}

// ---------------------------------------------------------------- Previsão

MF.Previsao = {
  async calcularProjecao(ano) {
    const mesesAnoAnterior = await MF.buscarHistoricoAnual(ano - 1);
    const meses = await MF.buscarHistoricoAnual(ano);
    // concatenado para permitir que a média móvel de janeiro/fevereiro
    // enxergue outubro-dezembro do ano anterior, e não fique sempre zerada.
    const linha = mesesAnoAnterior.concat(meses);
    const resultado = [];
    for (let i = 0; i < 12; i++) {
      const idxGlobal = 12 + i;
      const m = meses[i];
      const temDados = m.origem !== 'vazio';
      let previsto;
      if (temDados) {
        previsto = m.total_saidas + m.total_aberto;
      } else {
        const anteriores = [];
        for (let j = idxGlobal - 1; j >= 0 && anteriores.length < 3; j--) {
          if (linha[j].origem !== 'vazio') anteriores.push(linha[j].total_saidas + linha[j].total_aberto);
        }
        const base = anteriores.length ? anteriores.reduce((a, b) => a + b, 0) / anteriores.length : 0;
        // Regra de negócio: janeiro carrega material escolar (+15%) e
        // impostos anuais IPTU/IPVA (+20%); fevereiro carrega a cauda do
        // mesmo efeito sazonal (parcelamentos), estimada em +15%.
        let fatorSazonal = 0;
        if (m.mes === 1) fatorSazonal = 0.15 + 0.20;
        else if (m.mes === 2) fatorSazonal = 0.15;
        previsto = base * (1 + fatorSazonal);
      }
      resultado.push({ mes: m.mes, real: temDados ? (m.total_saidas + m.total_aberto) : null, previsto, entrada: m.total_entradas });
    }
    return resultado;
  }
};

// --------------------------------------------------------------- Narrativa

MF.Narrativa = {
  gerarNarrativaMensal({ mes, ano, entradas, saidas, projecao }) {
    const totalEnt = entradas.reduce((s, e) => s + (e.valor || 0), 0);
    const totalSai = saidas.reduce((s, x) => s + valorEfetivoSaida(x), 0);
    const diffPercent = totalEnt > 0 ? ((totalSai - totalEnt) / totalEnt * 100) : 0;

    const porOrigem = {};
    entradas.forEach(e => { porOrigem[e.origem] = (porOrigem[e.origem] || 0) + (e.valor || 0); });
    let origemTop = null, origemTopValor = 0;
    Object.entries(porOrigem).forEach(([o, v]) => { if (v > origemTopValor) { origemTop = o; origemTopValor = v; } });

    const frases = [];
    frases.push(diffPercent > 0
      ? `Em ${MF.Util.nomeMes(mes).toLowerCase()}/${ano}, as saídas superaram as entradas em ${MF.Util.formatPercent(diffPercent)}.`
      : `Em ${MF.Util.nomeMes(mes).toLowerCase()}/${ano}, as entradas superaram as saídas em ${MF.Util.formatPercent(Math.abs(diffPercent))}.`);

    if (origemTop) {
      frases.push(`A origem ${origemTop} representa ${MF.Util.formatPercent(totalEnt ? origemTopValor / totalEnt * 100 : 0)} das entradas totais.`);
    }

    if (projecao && projecao.length === 12) {
      const idxAtual = mes - 1;
      const idxProximo = mes === 12 ? 0 : mes;
      const atual = projecao[idxAtual].real ?? projecao[idxAtual].previsto;
      const proximo = projecao[idxProximo].previsto;
      if (atual > 0) {
        const delta = ((proximo - atual) / atual) * 100;
        const nomeProx = MF.Util.nomeMes(idxProximo + 1).toLowerCase();
        frases.push(`Tendência de ${delta >= 0 ? 'alta' : 'queda'} nas saídas para ${nomeProx} estimada em ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% com base no histórico recente.`);
      }
    }
    return frases.join(' ');
  },

  gerarNarrativaJuros({ jurosInfo }) {
    if (!jurosInfo || jurosInfo.totalJuros <= 0) return '';
    return `Neste mês, ${MF.Util.formatMoeda(jurosInfo.totalJuros)} foram pagos exclusivamente em juros de cartão, representando ${MF.Util.formatPercent(jurosInfo.percentualRenda)} da sua renda total. Em 12 meses, mantido esse padrão, isso equivale a ${MF.Util.formatMoeda(jurosInfo.totalJuros * 12)} perdidos apenas com juros.`;
  },

  gerarNarrativaRisco({ saidas, totalEntradas }) {
    const atrasadoTotal = saidas.filter(s => s.situacao === 'atrasada').reduce((s, x) => s + valorEfetivoSaida(x), 0);
    const urgenteTotal = saidas.filter(s => s.situacao === 'urgente').reduce((s, x) => s + valorEfetivoSaida(x), 0);
    const totalGeral = saidas.reduce((s, x) => s + valorEfetivoSaida(x), 0);
    if (totalGeral <= 0) return '';
    const percentRisco = (atrasadoTotal + urgenteTotal) / totalGeral * 100;
    if (atrasadoTotal <= 0 && urgenteTotal <= 0) return 'Não há pagamentos atrasados ou urgentes neste mês — situação financeira sob controle.';
    return `Existem ${MF.Util.formatMoeda(atrasadoTotal)} em pagamentos atrasados neste mês. Combinados com ${MF.Util.formatMoeda(urgenteTotal)} urgentes, ${MF.Util.formatPercent(percentRisco, 0)} das suas saídas estão em situação de risco. Recomenda-se priorizar a quitação das parcelas atrasadas para evitar acúmulo de juros.`;
  }
};

// --------------------------------------------------------------- Exportar

(() => {
  function carregarImagemComoDataURL(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        try { resolve(c.toDataURL('image/png')); } catch (e) { reject(e); }
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function gerarImagemGrafico(config, w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.style.position = 'fixed'; canvas.style.left = '-99999px'; canvas.style.top = '0';
    document.body.appendChild(canvas);
    const chart = new Chart(canvas.getContext('2d'), Object.assign({}, config, {
      options: Object.assign({ animation: false, responsive: false, maintainAspectRatio: false }, config.options)
    }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const dataUrl = canvas.toDataURL('image/png');
    chart.destroy();
    canvas.remove();
    return dataUrl;
  }

  function estiloCabecalho() {
    return { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1B2A4A' } } };
  }
  function estiloZebra() {
    return { fill: { fgColor: { rgb: '20203A' } } };
  }

  function aplicarCabecalho(ws, linha, numCols) {
    for (let c = 0; c < numCols; c++) {
      const ref = XLSX.utils.encode_cell({ r: linha, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      ws[ref].s = estiloCabecalho();
    }
  }
  function aplicarZebra(ws, primeiraLinha, ultimaLinha, numCols) {
    for (let r = primeiraLinha; r <= ultimaLinha; r += 2) {
      for (let c = 0; c < numCols; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) ws[ref].s = Object.assign({}, ws[ref].s, estiloZebra());
      }
    }
  }
  function formatarColuna(ws, colIndex, primeiraLinha, ultimaLinha, formato) {
    for (let r = primeiraLinha; r <= ultimaLinha; r++) {
      const ref = XLSX.utils.encode_cell({ r, c: colIndex });
      if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = formato;
    }
  }

  const FMT_MOEDA = '"R$" #,##0.00';
  const FMT_PCT = '0.0"%"';

  function rotuloSituacao(sit) { return MF.Situacoes[sit] ? MF.Situacoes[sit].rotulo : '-'; }

  async function gerarXLSX({ mes, ano }) {
    const { entradas, saidas } = await MF.buscarPorMesAno(mes, ano);
    const historico = await MF.buscarHistoricoAnual(ano);
    const projecao = await MF.Previsao.calcularProjecao(ano);
    const cartoes = await MF.buscarCartoes(mes, ano);

    const totalEnt = entradas.reduce((s, e) => s + (e.valor || 0), 0);
    const totalSai = saidas.reduce((s, x) => s + valorEfetivoSaida(x), 0);

    const wb = XLSX.utils.book_new();

    // ---- Aba 1: LANÇAMENTOS ----
    const l1 = [];
    l1.push([`LANÇAMENTOS — ${MF.Util.nomeMes(mes)}/${ano}`]);
    l1.push([]);
    l1.push(['ENTRADAS']);
    const linhaCabEnt = l1.length;
    l1.push(['Descrição', 'Origem', 'Valor', '% do Total', 'Data']);
    entradas.forEach(e => l1.push([e.descricao, e.origem, e.valor, totalEnt ? e.valor / totalEnt * 100 : 0, e.data]));
    const fimEnt = l1.length - 1;
    l1.push([]);
    l1.push(['SAÍDAS']);
    const linhaCabSai = l1.length;
    l1.push(['Descrição', 'Origem', 'Valor', 'Situação', '% do Total', 'Data']);
    saidas.forEach(s => l1.push([s.descricao, s.origem, valorEfetivoSaida(s), rotuloSituacao(s.situacao), totalSai ? valorEfetivoSaida(s) / totalSai * 100 : 0, s.data]));
    const fimSai = l1.length - 1;

    const ws1 = XLSX.utils.aoa_to_sheet(l1);
    ws1['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 10 }];
    aplicarCabecalho(ws1, linhaCabEnt, 5);
    aplicarCabecalho(ws1, linhaCabSai, 6);
    aplicarZebra(ws1, linhaCabEnt + 1, fimEnt, 5);
    aplicarZebra(ws1, linhaCabSai + 1, fimSai, 6);
    formatarColuna(ws1, 2, linhaCabEnt + 1, fimEnt, FMT_MOEDA);
    formatarColuna(ws1, 3, linhaCabEnt + 1, fimEnt, FMT_PCT);
    formatarColuna(ws1, 2, linhaCabSai + 1, fimSai, FMT_MOEDA);
    formatarColuna(ws1, 4, linhaCabSai + 1, fimSai, FMT_PCT);
    XLSX.utils.book_append_sheet(wb, ws1, 'LANÇAMENTOS');

    // ---- Aba 2: RESUMO ----
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const histRefAnterior = mes === 1 ? await MF.buscarHistoricoAnual(ano - 1) : historico;
    const dadosAnt = histRefAnterior.find(h => h.mes === mesAnt);
    const saiAnt = dadosAnt ? dadosAnt.total_saidas + dadosAnt.total_aberto : 0;
    const entAnt = dadosAnt ? dadosAnt.total_entradas : 0;
    const varSai = saiAnt ? ((totalSai - saiAnt) / saiAnt * 100) : 0;
    const varEnt = entAnt ? ((totalEnt - entAnt) / entAnt * 100) : 0;

    const porOrigemEnt = {}; entradas.forEach(e => { porOrigemEnt[e.origem] = (porOrigemEnt[e.origem] || 0) + e.valor; });
    const porOrigemSai = {}; saidas.forEach(s => { porOrigemSai[s.origem] = (porOrigemSai[s.origem] || 0) + valorEfetivoSaida(s); });

    const l2 = [];
    l2.push([`RESUMO — ${MF.Util.nomeMes(mes)}/${ano}`]);
    l2.push([]);
    l2.push(['Total de Entradas', totalEnt]);
    l2.push(['Total de Saídas', totalSai]);
    l2.push(['Saldo Líquido', totalEnt - totalSai]);
    l2.push(['Variação Entradas vs. mês anterior (%)', varEnt]);
    l2.push(['Variação Saídas vs. mês anterior (%)', varSai]);
    l2.push([]);
    l2.push(['% DE ENTRADAS POR ORIGEM']);
    const cabOrigEnt = l2.length;
    l2.push(['Origem', 'Valor', '%']);
    Object.entries(porOrigemEnt).forEach(([o, v]) => l2.push([o, v, totalEnt ? v / totalEnt * 100 : 0]));
    const fimOrigEnt = l2.length - 1;
    l2.push([]);
    l2.push(['% DE SAÍDAS POR ORIGEM']);
    const cabOrigSai = l2.length;
    l2.push(['Origem', 'Valor', '%']);
    Object.entries(porOrigemSai).forEach(([o, v]) => l2.push([o, v, totalSai ? v / totalSai * 100 : 0]));
    const fimOrigSai = l2.length - 1;

    const ws2 = XLSX.utils.aoa_to_sheet(l2);
    ws2['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 10 }];
    aplicarCabecalho(ws2, cabOrigEnt, 3);
    aplicarCabecalho(ws2, cabOrigSai, 3);
    formatarColuna(ws2, 1, 2, 4, FMT_MOEDA);
    formatarColuna(ws2, 1, cabOrigEnt + 1, fimOrigEnt, FMT_MOEDA);
    formatarColuna(ws2, 2, cabOrigEnt + 1, fimOrigEnt, FMT_PCT);
    formatarColuna(ws2, 1, cabOrigSai + 1, fimOrigSai, FMT_MOEDA);
    formatarColuna(ws2, 2, cabOrigSai + 1, fimOrigSai, FMT_PCT);
    XLSX.utils.book_append_sheet(wb, ws2, 'RESUMO');

    // ---- Aba 3: HISTÓRICO ----
    const l3 = [['Mês', 'Entradas', 'Saídas', 'Em Aberto', 'Saldo']];
    historico.forEach(h => l3.push([MF.Util.nomeMes(h.mes), h.total_entradas, h.total_saidas, h.total_aberto, h.saldo]));
    const ws3 = XLSX.utils.aoa_to_sheet(l3);
    ws3['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    aplicarCabecalho(ws3, 0, 5);
    aplicarZebra(ws3, 1, l3.length - 1, 5);
    [1, 2, 3, 4].forEach(c => formatarColuna(ws3, c, 1, l3.length - 1, FMT_MOEDA));
    XLSX.utils.book_append_sheet(wb, ws3, 'HISTÓRICO');

    // ---- Aba 4: PROJEÇÃO ----
    const l4 = [['Mês', 'Real', 'Previsto', 'Entradas']];
    projecao.forEach(p => l4.push([MF.Util.nomeMes(p.mes), p.real, p.previsto, p.entrada]));
    const ws4 = XLSX.utils.aoa_to_sheet(l4);
    ws4['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    aplicarCabecalho(ws4, 0, 4);
    [1, 2, 3].forEach(c => formatarColuna(ws4, c, 1, l4.length - 1, FMT_MOEDA));
    XLSX.utils.book_append_sheet(wb, ws4, 'PROJEÇÃO');

    // ---- Aba 5: JUROS CARTÃO ----
    const l5 = [['Cartão', 'Gasto', 'Valor Original', 'Juros R$', 'Juros %', 'Mês', 'Ano']];
    for (const c of cartoes) {
      const gastos = await MF.buscarGastosPorCartao(c.id, mes, ano);
      gastos.filter(g => g.tipo === 'juros').forEach(g => l5.push([c.nome, g.descricao, g.valor_original, g.valor_juros, g.taxa_juros, MF.Util.nomeMes(mes), ano]));
    }
    const ws5 = XLSX.utils.aoa_to_sheet(l5);
    ws5['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 8 }];
    aplicarCabecalho(ws5, 0, 7);
    if (l5.length > 1) { formatarColuna(ws5, 2, 1, l5.length - 1, FMT_MOEDA); formatarColuna(ws5, 3, 1, l5.length - 1, FMT_MOEDA); formatarColuna(ws5, 4, 1, l5.length - 1, FMT_PCT); }
    XLSX.utils.book_append_sheet(wb, ws5, 'JUROS CARTÃO');

    // ---- Aba 6: SITUAÇÃO DAS SAÍDAS ----
    const l6 = [['Descrição', 'Origem', 'Valor Original', 'Valor Pago', 'Situação', 'Dias Atraso', 'Cartão Vinculado', 'Mês', 'Ano']];
    for (const s of saidas) {
      let nomeCartao = '';
      if (s.cartao_vinculado_id) { const c = await MF.buscarCartaoPorId(s.cartao_vinculado_id); nomeCartao = c ? c.nome : ''; }
      l6.push([s.descricao, s.origem, s.valor, s.valor_pago, rotuloSituacao(s.situacao), s.dias_atraso || '', nomeCartao, MF.Util.nomeMes(mes), ano]);
    }
    const ws6 = XLSX.utils.aoa_to_sheet(l6);
    ws6['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 8 }];
    aplicarCabecalho(ws6, 0, 9);
    if (l6.length > 1) { formatarColuna(ws6, 2, 1, l6.length - 1, FMT_MOEDA); formatarColuna(ws6, 3, 1, l6.length - 1, FMT_MOEDA); }
    XLSX.utils.book_append_sheet(wb, ws6, 'SITUAÇÃO DAS SAÍDAS');

    XLSX.writeFile(wb, `financeiro-${ano}-${String(mes).padStart(2, '0')}.xlsx`, { cellStyles: true });
  }

  async function gerarPDF({ mes, ano }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;

    const { entradas, saidas } = await MF.buscarPorMesAno(mes, ano);
    const historico = await MF.buscarHistoricoAnual(ano);
    const projecao = await MF.Previsao.calcularProjecao(ano);
    const jurosInfo = await MF.calcularJurosTotais(mes, ano);
    const logoUrl = await MF.buscarConfiguracao('logo_url', '');

    const totalEnt = entradas.reduce((s, e) => s + (e.valor || 0), 0);
    const totalSai = saidas.reduce((s, x) => s + valorEfetivoSaida(x), 0);

    // ---------- CAPA ----------
    doc.setFillColor(26, 26, 46);
    doc.rect(0, 0, pageW, pageH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text('RELATÓRIO FINANCEIRO DOMÉSTICO', pageW / 2, 220, { align: 'center' });
    doc.setFontSize(14);
    doc.text(`Período analisado: ${MF.Util.nomeMes(mes)} / ${ano}`, pageW / 2, 255, { align: 'center' });
    doc.setFontSize(11);
    doc.text(`Data de geração: ${MF.Util.hojeBR()}`, pageW / 2, 278, { align: 'center' });
    if (logoUrl) {
      try {
        const img = await carregarImagemComoDataURL(logoUrl);
        doc.addImage(img, 'PNG', pageW / 2 - 45, 90, 90, 90);
      } catch (e) { /* logo opcional: URL inválida ou bloqueada por CORS — segue sem imagem */ }
    }

    // ---------- ENTRADAS DETALHADAS ----------
    doc.addPage();
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.text('ENTRADAS DETALHADAS', margin, 50);

    const porOrigem = {};
    entradas.forEach(e => { porOrigem[e.origem] = (porOrigem[e.origem] || 0) + e.valor; });

    doc.autoTable({
      startY: 65,
      head: [['Descrição', 'Origem', 'Valor', '% do Total', 'Data']],
      body: entradas.map(e => [e.descricao, e.origem, MF.Util.formatMoeda(e.valor), MF.Util.formatPercent(totalEnt ? e.valor / totalEnt * 100 : 0), e.data]),
      foot: [['TOTAL', '', MF.Util.formatMoeda(totalEnt), '100,0%', '']],
      headStyles: { fillColor: [26, 26, 46] },
      margin: { left: margin, right: margin }
    });
    let y = doc.lastAutoTable.finalY + 22;
    doc.setFontSize(12);
    doc.text('Acumulado por origem:', margin, y);
    doc.autoTable({
      startY: y + 8,
      head: [['Origem', 'Total', '% do Total']],
      body: Object.entries(porOrigem).map(([o, v]) => [o, MF.Util.formatMoeda(v), MF.Util.formatPercent(totalEnt ? v / totalEnt * 100 : 0)]),
      headStyles: { fillColor: [74, 144, 217] },
      margin: { left: margin, right: margin }
    });

    // ---------- SAÍDAS DETALHADAS ----------
    doc.addPage();
    doc.setFontSize(16);
    doc.text('SAÍDAS DETALHADAS', margin, 50);
    doc.autoTable({
      startY: 65,
      head: [['Descrição', 'Origem', 'Valor', 'Situação', '% do Total', 'Data']],
      body: saidas.map(s => [s.descricao, s.origem, MF.Util.formatMoeda(valorEfetivoSaida(s)), rotuloSituacao(s.situacao), MF.Util.formatPercent(totalSai ? valorEfetivoSaida(s) / totalSai * 100 : 0), s.data]),
      foot: [['TOTAL', '', MF.Util.formatMoeda(totalSai), '', '100,0%', '']],
      headStyles: { fillColor: [26, 26, 46] },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const mapa = { 'ATRASADA': [231, 76, 60], 'URGENTE': [230, 126, 34], 'PAGO C/ CARTÃO': [180, 140, 0], 'EM DIA': [39, 174, 96] };
          const cor = mapa[data.cell.raw];
          if (cor) { data.cell.styles.textColor = cor; data.cell.styles.fontStyle = 'bold'; }
        }
      }
    });

    // ---------- GRÁFICOS E CURVAS ----------
    doc.addPage();
    doc.setFontSize(16);
    doc.text('GRÁFICOS E CURVAS', margin, 50);
    doc.setFontSize(10);
    doc.text('Distribuição de entradas por origem', margin, 68);
    doc.text('Curva de previsão de saídas', margin + 260, 68);
    const imgPizza = await gerarImagemGrafico({
      type: 'pie',
      data: { labels: Object.keys(porOrigem), datasets: [{ data: Object.values(porOrigem), backgroundColor: MF.PALETA }] },
      options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } }
    }, 480, 320);
    doc.addImage(imgPizza, 'PNG', margin, 76, 230, 153);

    const imgPrevisao = await gerarImagemGrafico({
      type: 'line',
      data: {
        labels: projecao.map(p => MF.Util.nomeMes(p.mes, true)),
        datasets: [
          { label: 'Entradas', data: projecao.map(p => p.entrada), borderColor: '#27ae60', backgroundColor: '#27ae60', fill: false, tension: .25 },
          { label: 'Saídas real/previsto', data: projecao.map(p => p.real ?? p.previsto), borderColor: '#e74c3c', backgroundColor: '#e74c3c', fill: false, tension: .25 }
        ]
      },
      options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } }
    }, 480, 320);
    doc.addImage(imgPrevisao, 'PNG', margin + 250, 76, 230, 153);

    // ---------- ANÁLISE NARRATIVA ----------
    doc.addPage();
    doc.setFontSize(16);
    doc.text('ANÁLISE NARRATIVA', margin, 50);
    doc.setFontSize(11);
    const partes = [
      MF.Narrativa.gerarNarrativaMensal({ mes, ano, entradas, saidas, projecao }),
      MF.Narrativa.gerarNarrativaRisco({ saidas, totalEntradas: totalEnt }),
      MF.Narrativa.gerarNarrativaJuros({ jurosInfo })
    ].filter(Boolean);
    const linhas = doc.splitTextToSize(partes.join('\n\n'), pageW - margin * 2);
    doc.text(linhas, margin, 75);

    // ---------- HISTÓRICO ANUAL ----------
    doc.addPage();
    doc.setFontSize(16);
    doc.text('HISTÓRICO ANUAL — ' + ano, margin, 50);
    doc.autoTable({
      startY: 65,
      head: [['Mês', 'Entradas', 'Saídas', 'Em Aberto', 'Saldo']],
      body: historico.map(h => [MF.Util.nomeMes(h.mes), MF.Util.formatMoeda(h.total_entradas), MF.Util.formatMoeda(h.total_saidas), MF.Util.formatMoeda(h.total_aberto), MF.Util.formatMoeda(h.saldo)]),
      headStyles: { fillColor: [26, 26, 46] },
      margin: { left: margin, right: margin }
    });

    // ---------- RODAPÉ ----------
    const totalPaginas = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 160);
      doc.text(`Gerado em ${MF.Util.hojeBR()} | Página ${i} de ${totalPaginas} | CONFIDENCIAL`, pageW / 2, pageH - 20, { align: 'center' });
    }

    doc.save(`relatorio-financeiro-${ano}-${String(mes).padStart(2, '0')}.pdf`);
  }

  MF.Exportar = { gerarXLSX, gerarPDF, gerarImagemGrafico };
})();

/* ==========================================================================
   Parte 2: controlador da página index.html (lançamentos)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  if (document.body.dataset.pagina !== 'index') return;
  await MF.Auth.exigirPin();
  initIndex();
});

let periodo = MF.Util.mesAnoAtual();
let ordenarSituacao = true;
let focoPendente = null;

async function initIndex() {
  popularSeletoresPeriodo();
  ordenarSituacao = await MF.buscarConfiguracao('ordenar_situacao', true);
  const logoSalvo = await MF.buscarConfiguracao('logo_url', '');
  document.getElementById('config-logo-url').value = logoSalvo;

  document.getElementById('sel-mes').addEventListener('change', onMudarPeriodo);
  document.getElementById('sel-ano').addEventListener('change', onMudarPeriodo);

  document.getElementById('fab-nova-entrada').addEventListener('click', () => {
    document.querySelectorAll('#corpo-entradas tr[data-id="novo"] input.campo-nav')[0]?.focus();
  });
  document.getElementById('fab-nova-saida').addEventListener('click', () => {
    document.querySelectorAll('#corpo-saidas tr[data-id="novo"] input.campo-nav')[0]?.focus();
  });
  document.getElementById('fab-novo-cartao').addEventListener('click', () => iniciarNovoCartao());

  document.getElementById('btn-ordenar-situacao').addEventListener('click', async () => {
    ordenarSituacao = !ordenarSituacao;
    await MF.salvarConfiguracao('ordenar_situacao', ordenarSituacao);
    atualizarBotaoOrdenar();
    carregarTudo();
  });
  atualizarBotaoOrdenar();

  document.getElementById('btn-exportar-xlsx').addEventListener('click', () => exportarComFeedback('btn-exportar-xlsx', () => MF.Exportar.gerarXLSX(periodo)));
  document.getElementById('btn-exportar-pdf').addEventListener('click', () => exportarComFeedback('btn-exportar-pdf', () => MF.Exportar.gerarPDF(periodo)));

  document.getElementById('btn-salvar-logo').addEventListener('click', async () => {
    const url = document.getElementById('config-logo-url').value.trim();
    if (url && !/^https:\/\/.+\..+/.test(url)) {
      MF.Util.toast('URL inválida. Use https://...', 'erro');
      return;
    }
    await MF.salvarConfiguracao('logo_url', url);
    MF.Util.toast('LOGO SALVA ✓');
  });
  document.getElementById('btn-backup-exportar').addEventListener('click', baixarBackup);
  document.getElementById('input-backup-importar').addEventListener('change', restaurarBackup);

  await carregarTudo();
}

function popularSeletoresPeriodo() {
  const selMes = document.getElementById('sel-mes');
  const selAno = document.getElementById('sel-ano');
  selMes.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const op = document.createElement('option');
    op.value = m; op.textContent = MF.Util.nomeMes(m);
    if (m === periodo.mes) op.selected = true;
    selMes.appendChild(op);
  }
  selAno.innerHTML = '';
  const anoAtual = new Date().getFullYear();
  for (let a = anoAtual - 3; a <= anoAtual + 1; a++) {
    const op = document.createElement('option');
    op.value = a; op.textContent = a;
    if (a === periodo.ano) op.selected = true;
    selAno.appendChild(op);
  }
}

function onMudarPeriodo() {
  periodo = { mes: parseInt(document.getElementById('sel-mes').value, 10), ano: parseInt(document.getElementById('sel-ano').value, 10) };
  carregarTudo();
}

function atualizarBotaoOrdenar() {
  const btn = document.getElementById('btn-ordenar-situacao');
  btn.textContent = ordenarSituacao ? 'ORDENAR POR SITUAÇÃO: LIGADO ↕' : 'ORDENAR POR SITUAÇÃO: DESLIGADO ↕';
}

async function carregarTudo() {
  const { entradas, saidas } = await MF.buscarPorMesAno(periodo.mes, periodo.ano);
  const cartoes = await MF.buscarCartoes(periodo.mes, periodo.ano);

  renderEntradas(entradas);
  renderSaidas(saidas);
  await renderCartoes(cartoes);
  renderTotais(entradas, saidas);
  renderPainelSituacoes(saidas);
  renderVariacaoPeriodo(entradas, saidas);

  if (focoPendente) {
    const el = document.querySelector(focoPendente);
    if (el) { el.focus(); if (el.select) el.select(); }
    focoPendente = null;
  }
}

function renderVariacaoPeriodo(entradas, saidas) {
  const totalEnt = entradas.reduce((s, e) => s + (e.valor || 0), 0);
  const totalSai = saidas.reduce((s, x) => s + valorEfetivoSaida(x), 0);
  const variacao = totalEnt > 0 ? ((totalSai - totalEnt) / totalEnt * 100) : 0;
  const el = document.getElementById('rotulo-periodo-variacao');
  const sobe = variacao > 0;
  el.innerHTML = `<span class="${sobe ? 'txt-vermelho seta-alta' : 'txt-verde seta-baixa'}">${MF.Util.formatPercent(Math.abs(variacao))}</span>`;
  el.title = 'Variação (Saídas - Entradas) / Entradas';
}

// ------------------------------------------------------------------ ENTRADAS

function renderEntradas(entradas) {
  const corpo = document.getElementById('corpo-entradas');
  corpo.innerHTML = '';
  entradas.forEach(e => corpo.appendChild(criarLinhaEntrada(e)));
  corpo.appendChild(criarLinhaEntrada(null));
}

function criarLinhaEntrada(entrada) {
  const tr = document.createElement('tr');
  tr.dataset.id = entrada ? entrada.id : 'novo';
  if (!entrada) tr.classList.add('linha-nova');

  tr.innerHTML = `
    <td data-rotulo="Descrição"><input class="campo maiusculas campo-nav" data-campo="descricao" placeholder="NOME OU LOCAL DO RECEBIMENTO" /></td>
    <td data-rotulo="Origem"><input class="campo maiusculas campo-nav" data-campo="origem" placeholder="ORIGEM: MARLENE / THIAGO / INQUILINO..." /></td>
    <td data-rotulo="Valor" class="col-valor"><input class="campo campo-nav" data-campo="valor" inputmode="numeric" placeholder="R$ 0,00" /></td>
    <td data-rotulo="Data" class="col-data"><input class="campo campo-nav" data-campo="data" inputmode="numeric" placeholder="DD/MM/AA" maxlength="8" /></td>
    <td class="col-acoes">${entrada ? '<button class="linha-excluir" title="Excluir">✕</button>' : ''}</td>
  `;

  const campoDesc = tr.querySelector('[data-campo="descricao"]');
  const campoOrigem = tr.querySelector('[data-campo="origem"]');
  const campoValor = tr.querySelector('[data-campo="valor"]');
  const campoData = tr.querySelector('[data-campo="data"]');

  MF.Util.ligarMaiusculas(campoDesc);
  MF.Util.ligarMaiusculas(campoOrigem);
  MF.Util.ligarMascaraMoeda(campoValor);
  MF.Util.ligarMascaraData(campoData);

  if (entrada) {
    campoDesc.value = entrada.descricao || '';
    campoOrigem.value = entrada.origem || '';
    MF.Util.definirValorMascaraMoeda(campoValor, entrada.valor || 0);
    campoData.value = entrada.data || '';
    [campoDesc, campoOrigem].forEach(c => c.addEventListener('blur', () => salvarEdicaoEntrada(tr, entrada)));
    campoValor.addEventListener('blur', () => salvarEdicaoEntrada(tr, entrada));
    campoData.addEventListener('blur', () => salvarEdicaoEntrada(tr, entrada));
    tr.querySelector('.linha-excluir').addEventListener('click', async () => {
      if (!confirm('Excluir esta entrada?')) return;
      await MF.excluirLancamento(entrada.id);
      MF.Util.toast('EXCLUÍDO');
      carregarTudo();
    });
  }

  MF.Util.ligarNavegacaoEnter(tr, () => {
    if (entrada) salvarEdicaoEntrada(tr, entrada, true);
    else salvarNovaEntrada(tr);
  });
  return tr;
}

async function salvarNovaEntrada(tr) {
  const descricao = tr.querySelector('[data-campo="descricao"]').value.trim();
  const origem = tr.querySelector('[data-campo="origem"]').value.trim();
  const valor = MF.Util.valorMascaraMoeda(tr.querySelector('[data-campo="valor"]'));
  const dataStr = tr.querySelector('[data-campo="data"]').value.trim();

  if (!descricao) { MF.Util.toast('INFORME A DESCRIÇÃO', 'erro'); return; }
  const dataParse = MF.Util.parseDataBR(dataStr) || (() => { const h = MF.Util.hojeBR(); return MF.Util.parseDataBR(h); })();
  const dataFinal = MF.Util.parseDataBR(dataStr) ? dataStr : MF.Util.hojeBR();

  focoPendente = '#corpo-entradas tr[data-id="novo"] [data-campo="descricao"]';
  await MF.salvarLancamento({
    tipo: 'entrada', descricao, origem, valor,
    data: dataFinal, ano: dataParse.ano, mes: dataParse.mes
  });
  MF.Util.toast('SALVO ✓');
  carregarTudo();
}

async function salvarEdicaoEntrada(tr, entrada, notificar) {
  const descricao = tr.querySelector('[data-campo="descricao"]').value.trim();
  const origem = tr.querySelector('[data-campo="origem"]').value.trim();
  const valor = MF.Util.valorMascaraMoeda(tr.querySelector('[data-campo="valor"]'));
  const dataStr = tr.querySelector('[data-campo="data"]').value.trim();
  const dataParse = MF.Util.parseDataBR(dataStr);
  if (!dataParse) return;
  await MF.salvarLancamento(Object.assign({}, entrada, { descricao, origem, valor, data: dataStr, ano: dataParse.ano, mes: dataParse.mes }));
  await atualizarResumos();
  if (notificar) MF.Util.toast('ATUALIZADO ✓');
}

// -------------------------------------------------------------------- SAÍDAS

function renderSaidas(saidas) {
  const corpo = document.getElementById('corpo-saidas');
  corpo.innerHTML = '';
  let lista = saidas.slice();
  if (ordenarSituacao) {
    lista.sort((a, b) => (MF.Situacoes[a.situacao]?.prioridade || 9) - (MF.Situacoes[b.situacao]?.prioridade || 9));
  }
  lista.forEach(s => corpo.appendChild(criarLinhaSaida(s)));
  corpo.appendChild(criarLinhaSaida(null));
}

function criarLinhaSaida(saida) {
  const tr = document.createElement('tr');
  tr.dataset.id = saida ? saida.id : 'novo';
  if (!saida) tr.classList.add('linha-nova');

  const tagCartao = saida && saida.situacao === 'cartao' ? '<span class="tag-cartao">💳 CARTÃO</span>' : '';

  tr.innerHTML = `
    <td data-rotulo="Descrição"><input class="campo maiusculas campo-nav" data-campo="descricao" placeholder="DESCRIÇÃO DA SAÍDA" />${tagCartao}</td>
    <td data-rotulo="Origem"><input class="campo maiusculas campo-nav" data-campo="origem" placeholder="ORIGEM / CATEGORIA" /></td>
    <td data-rotulo="Valor" class="col-valor"><input class="campo campo-nav" data-campo="valor" inputmode="numeric" placeholder="R$ 0,00" /></td>
    <td data-rotulo="Data" class="col-data"><input class="campo campo-nav" data-campo="data" inputmode="numeric" placeholder="DD/MM/AA" maxlength="8" /></td>
    <td data-rotulo="Situação">${saida ? renderSituacaoSeletor(saida) : '<span class="txt-muted" style="font-size:.75rem">salve para definir</span>'}</td>
    <td class="col-acoes">${saida ? '<button class="linha-excluir" title="Excluir">✕</button>' : ''}</td>
  `;

  const campoDesc = tr.querySelector('[data-campo="descricao"]');
  const campoOrigem = tr.querySelector('[data-campo="origem"]');
  const campoValor = tr.querySelector('[data-campo="valor"]');
  const campoData = tr.querySelector('[data-campo="data"]');

  MF.Util.ligarMaiusculas(campoDesc);
  MF.Util.ligarMaiusculas(campoOrigem);
  MF.Util.ligarMascaraMoeda(campoValor);
  MF.Util.ligarMascaraData(campoData);

  if (saida) {
    campoDesc.value = saida.descricao || '';
    campoOrigem.value = saida.origem || '';
    MF.Util.definirValorMascaraMoeda(campoValor, saida.valor || 0);
    campoData.value = saida.data || '';
    [campoDesc, campoOrigem, campoValor, campoData].forEach(c => c.addEventListener('blur', () => salvarEdicaoSaida(tr, saida)));
    tr.querySelector('.linha-excluir').addEventListener('click', async () => {
      if (!confirm('Excluir esta saída?')) return;
      await MF.excluirLancamento(saida.id);
      MF.Util.toast('EXCLUÍDO');
      carregarTudo();
    });
    wireSituacaoSeletor(tr, saida);
  }

  MF.Util.ligarNavegacaoEnter(tr, () => {
    if (saida) salvarEdicaoSaida(tr, saida, true);
    else salvarNovaSaida(tr);
  });
  return tr;
}

function renderSituacaoSeletor(saida) {
  const botoes = Object.entries(MF.Situacoes).map(([chave, def]) =>
    `<button type="button" class="situacao-btn ${saida.situacao === chave ? 'ativa' : ''}" data-situacao="${chave}">${def.icone} ${def.rotulo}</button>`
  ).join('');
  return `<div class="situacao-seletor" data-id="${saida.id}">${botoes}</div>` + renderCamposExtras(saida);
}

function renderCamposExtras(saida) {
  const sit = saida.situacao;
  if (!sit) return '';
  let extras = `<div class="campo-grupo"><label>Valor Pago/Registrado</label><input class="campo" data-campo="valor_pago" inputmode="numeric" placeholder="R$ 0,00" /></div>`;
  if (sit === 'atrasada') extras += `<div class="campo-grupo"><label>Dias em Atraso</label><input class="campo" data-campo="dias_atraso" type="number" min="0" placeholder="0" /></div>`;
  if (sit === 'urgente') extras += `<div class="campo-grupo"><label>Data Limite</label><input class="campo" data-campo="data_limite" inputmode="numeric" placeholder="DD/MM/AA" maxlength="8" /></div>`;
  if (sit === 'cartao') extras += `<div class="campo-grupo"><label>Selecionar Cartão</label><select class="campo" data-campo="cartao_vinculado_id"></select></div>`;
  return `<div class="situacao-extra visivel" data-id="${saida.id}">${extras}</div>`;
}

function wireSituacaoSeletor(tr, saida) {
  tr.querySelectorAll('.situacao-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const novaSituacao = btn.dataset.situacao;
      const atualizado = Object.assign({}, saida, { situacao: novaSituacao });
      if (atualizado.valor_pago == null) atualizado.valor_pago = atualizado.valor;
      await MF.salvarLancamento(atualizado);
      focoPendente = `[data-id="${saida.id}"] [data-campo="valor_pago"]`;
      MF.Util.toast('SITUAÇÃO ATUALIZADA ✓');
      carregarTudo();
    });
  });

  const extra = tr.querySelector('.situacao-extra');
  if (!extra) return;

  const campoValorPago = extra.querySelector('[data-campo="valor_pago"]');
  if (campoValorPago) {
    MF.Util.ligarMascaraMoeda(campoValorPago);
    MF.Util.definirValorMascaraMoeda(campoValorPago, saida.valor_pago != null ? saida.valor_pago : saida.valor);
    campoValorPago.addEventListener('blur', () => salvarEdicaoSaida(tr, saida));
    campoValorPago.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); salvarEdicaoSaida(tr, saida, true); } });
  }

  const campoDias = extra.querySelector('[data-campo="dias_atraso"]');
  if (campoDias) { campoDias.value = saida.dias_atraso || ''; campoDias.addEventListener('blur', () => salvarEdicaoSaida(tr, saida)); }

  const campoLimite = extra.querySelector('[data-campo="data_limite"]');
  if (campoLimite) { campoLimite.value = saida.data_limite || ''; MF.Util.ligarMascaraData(campoLimite); campoLimite.addEventListener('blur', () => salvarEdicaoSaida(tr, saida)); }

  const selectCartao = extra.querySelector('[data-campo="cartao_vinculado_id"]');
  if (selectCartao) {
    MF.buscarCartoes(periodo.mes, periodo.ano).then(cartoes => {
      if (!cartoes.length) {
        selectCartao.innerHTML = '<option value="">Nenhum cartão cadastrado</option>';
        return;
      }
      selectCartao.innerHTML = cartoes.map(c => `<option value="${c.id}" ${saida.cartao_vinculado_id === c.id ? 'selected' : ''}>${MF.Util.escapeHtml(c.nome)}</option>`).join('');
    });
    selectCartao.addEventListener('change', async () => {
      const cartaoId = parseInt(selectCartao.value, 10);
      const valorPago = campoValorPago ? MF.Util.valorMascaraMoeda(campoValorPago) : saida.valor;
      if (cartaoId) { await MF.vincularSaidaAoCartao(saida.id, cartaoId, valorPago); MF.Util.toast('VINCULADO AO CARTÃO ✓'); carregarTudo(); }
    });
  }
}

async function salvarNovaSaida(tr) {
  const descricao = tr.querySelector('[data-campo="descricao"]').value.trim();
  const origem = tr.querySelector('[data-campo="origem"]').value.trim();
  const valor = MF.Util.valorMascaraMoeda(tr.querySelector('[data-campo="valor"]'));
  const dataStr = tr.querySelector('[data-campo="data"]').value.trim();

  if (!descricao) { MF.Util.toast('INFORME A DESCRIÇÃO', 'erro'); return; }
  const dataParse = MF.Util.parseDataBR(dataStr) || MF.Util.parseDataBR(MF.Util.hojeBR());
  const dataFinal = MF.Util.parseDataBR(dataStr) ? dataStr : MF.Util.hojeBR();

  focoPendente = '#corpo-saidas tr[data-id="novo"] [data-campo="descricao"]';
  await MF.salvarLancamento({
    tipo: 'saida', descricao, origem, valor,
    data: dataFinal, ano: dataParse.ano, mes: dataParse.mes,
    situacao: 'emdia', valor_pago: valor, dias_atraso: null, data_limite: null, cartao_vinculado_id: null
  });
  MF.Util.toast('SALVO ✓');
  carregarTudo();
}

async function salvarEdicaoSaida(tr, saida, notificar) {
  const descricao = tr.querySelector('[data-campo="descricao"]').value.trim();
  const origem = tr.querySelector('[data-campo="origem"]').value.trim();
  const valor = MF.Util.valorMascaraMoeda(tr.querySelector('[data-campo="valor"]'));
  const dataStr = tr.querySelector('[data-campo="data"]').value.trim();
  const dataParse = MF.Util.parseDataBR(dataStr);
  if (!dataParse) return;

  const campoValorPago = tr.querySelector('[data-campo="valor_pago"]');
  const campoDias = tr.querySelector('[data-campo="dias_atraso"]');
  const campoLimite = tr.querySelector('[data-campo="data_limite"]');

  const atualizado = Object.assign({}, saida, {
    descricao, origem, valor, data: dataStr, ano: dataParse.ano, mes: dataParse.mes
  });
  if (campoValorPago) atualizado.valor_pago = MF.Util.valorMascaraMoeda(campoValorPago);
  if (campoDias) atualizado.dias_atraso = campoDias.value ? parseInt(campoDias.value, 10) : null;
  if (campoLimite) atualizado.data_limite = campoLimite.value || null;

  await MF.salvarLancamento(atualizado);
  await atualizarResumos();
  if (notificar) MF.Util.toast('ATUALIZADO ✓');
}

async function atualizarResumos() {
  const { entradas, saidas } = await MF.buscarPorMesAno(periodo.mes, periodo.ano);
  renderTotais(entradas, saidas);
  renderPainelSituacoes(saidas);
  renderVariacaoPeriodo(entradas, saidas);
}

// ------------------------------------------------------------- TOTALIZADORES

function renderTotais(entradas, saidas) {
  const totalEnt = entradas.reduce((s, e) => s + (e.valor || 0), 0);
  const emDia = saidas.filter(s => s.situacao === 'emdia').reduce((s, x) => s + valorEfetivoSaida(x), 0);
  const aberto = saidas.filter(s => s.situacao === 'atrasada' || s.situacao === 'urgente').reduce((s, x) => s + valorEfetivoSaida(x), 0);
  const cartao = saidas.filter(s => s.situacao === 'cartao').reduce((s, x) => s + valorEfetivoSaida(x), 0);
  const saldoLiquido = totalEnt - (emDia + cartao);

  document.getElementById('tot-entradas').textContent = MF.Util.formatMoeda(totalEnt);
  document.getElementById('tot-saidas-pagas').textContent = MF.Util.formatMoeda(emDia);
  document.getElementById('tot-aberto').textContent = MF.Util.formatMoeda(aberto);
  document.getElementById('tot-saldo').textContent = MF.Util.formatMoeda(saldoLiquido);
  document.getElementById('tot-saldo').className = 'valor-grande ' + (saldoLiquido >= 0 ? 'txt-verde' : 'txt-vermelho');

  const saidasAVista = emDia + aberto;
  document.getElementById('resumo-saidas-avista').textContent = MF.Util.formatMoeda(saidasAVista);
  document.getElementById('resumo-saidas-cartao').textContent = MF.Util.formatMoeda(cartao);
  document.getElementById('resumo-saidas-total').textContent = MF.Util.formatMoeda(saidasAVista + cartao);
}

function renderPainelSituacoes(saidas) {
  const somaPor = (sit) => saidas.filter(s => s.situacao === sit).reduce((s, x) => s + valorEfetivoSaida(x), 0);
  const atrasada = somaPor('atrasada'), urgente = somaPor('urgente'), cartao = somaPor('cartao'), emdia = somaPor('emdia');
  const total = atrasada + urgente + cartao + emdia;
  const painel = document.getElementById('painel-situacoes');
  painel.innerHTML = `
    <div class="linha-painel"><span class="txt-vermelho">⚠ ATRASADAS</span><span class="txt-vermelho">${MF.Util.formatMoeda(atrasada)}</span></div>
    <div class="linha-painel"><span class="txt-laranja">🔔 URGENTES</span><span class="txt-laranja">${MF.Util.formatMoeda(urgente)}</span></div>
    <div class="linha-painel"><span class="txt-amarelo">💳 PAGO C/ CARTÃO</span><span class="txt-amarelo">${MF.Util.formatMoeda(cartao)}</span></div>
    <div class="linha-painel"><span class="txt-verde">✓ EM DIA (PAGAS)</span><span class="txt-verde">${MF.Util.formatMoeda(emdia)}</span></div>
    <div class="linha-painel total"><span>TOTAL SAÍDAS</span><span>${MF.Util.formatMoeda(total)}</span></div>
  `;
}

// -------------------------------------------------------------- CARTÃO DE CRÉDITO

let cartaoDraftAtivo = false;

async function renderCartoes(cartoes) {
  const lista = document.getElementById('lista-cartoes');
  lista.innerHTML = '';
  for (const c of cartoes) lista.appendChild(await criarCartaoElemento(c));
  if (cartaoDraftAtivo) lista.appendChild(await criarCartaoElemento(null));

  const jurosInfo = await MF.calcularJurosTotais(periodo.mes, periodo.ano);
  const resumo = document.getElementById('resumo-cartoes');
  const alerta = jurosInfo.percentualRenda > 10 ? '<div class="alerta critico">⚠ Mais de 10% da sua renda está comprometida com juros de cartão.</div>' : '';
  resumo.innerHTML = `
    <div class="linha-painel"><span>TOTAL GERAL EM CARTÕES</span><span class="negrito">${MF.Util.formatMoeda(jurosInfo.totalGastosCartao)}</span></div>
    <div class="linha-painel"><span class="txt-vermelho negrito">TOTAL SOMENTE EM JUROS</span><span class="txt-vermelho negrito">${MF.Util.formatMoeda(jurosInfo.totalJuros)}</span></div>
    <div class="linha-painel"><span>% DA RENDA COMPROMETIDA COM JUROS</span><span class="${jurosInfo.percentualRenda > 10 ? 'txt-vermelho negrito' : ''}">${MF.Util.formatPercent(jurosInfo.percentualRenda)}</span></div>
    ${alerta}
  `;
}

function iniciarNovoCartao() {
  cartaoDraftAtivo = true;
  carregarTudo().then(() => {
    document.querySelector('#lista-cartoes .cartao-item:last-child input[data-campo="nome"]')?.focus();
  });
}

async function criarCartaoElemento(cartao) {
  const div = document.createElement('div');
  div.className = 'cartao-item';
  if (!cartao) div.classList.add('linha-nova');
  div.dataset.id = cartao ? cartao.id : 'novo';

  const gastos = cartao ? await MF.buscarGastosPorCartao(cartao.id, periodo.mes, periodo.ano) : [];
  const totalGastos = gastos.reduce((s, g) => s + (g.valor_total || 0), 0);
  const totalJuros = gastos.filter(g => g.tipo === 'juros').reduce((s, g) => s + (g.valor_juros || 0), 0);
  const totalSemJuros = totalGastos - totalJuros;
  const pctFatura = cartao && cartao.fatura_atual ? (totalJuros / cartao.fatura_atual * 100) : 0;
  const limiteDisponivel = cartao ? (cartao.limite_total || 0) - (cartao.fatura_atual || 0) : 0;

  div.innerHTML = `
    <div class="cartao-item-cabecalho">
      <span class="chevron">▾</span>
      <div class="novo-cartao-form" style="flex:1">
        <div class="campo-grupo"><label>Nome do Cartão</label><input class="campo maiusculas campo-nav" data-campo="nome" placeholder="NUBANK, ITAÚ VISA..." /></div>
        <div class="campo-grupo"><label>Vencimento</label><input class="campo campo-nav" data-campo="vencimento" type="number" min="1" max="31" placeholder="Dia" /></div>
        <div class="campo-grupo"><label>Limite Total</label><input class="campo campo-nav" data-campo="limite_total" inputmode="numeric" placeholder="R$ 0,00" /></div>
        <div class="campo-grupo"><label>Fatura Atual</label><input class="campo campo-nav" data-campo="fatura_atual" inputmode="numeric" placeholder="R$ 0,00" /></div>
      </div>
      ${cartao ? '<button class="linha-excluir" title="Excluir cartão">✕</button>' : ''}
    </div>
    <div class="cartao-corpo">
      ${cartao ? `
      <div class="grade-totais">
        <div class="cartao-total"><div class="rotulo">Total de Gastos</div><div class="valor-grande">${MF.Util.formatMoeda(totalGastos)}</div></div>
        <div class="cartao-total"><div class="rotulo">Total em Juros</div><div class="valor-grande txt-vermelho">${MF.Util.formatMoeda(totalJuros)}</div></div>
        <div class="cartao-total"><div class="rotulo">Total sem Juros</div><div class="valor-grande">${MF.Util.formatMoeda(totalSemJuros)}</div></div>
        <div class="cartao-total"><div class="rotulo">% Fatura em Juros</div><div class="valor-grande ${pctFatura > 10 ? 'txt-vermelho' : ''}">${MF.Util.formatPercent(pctFatura)}</div></div>
      </div>
      <div class="txt-muted" style="margin-bottom:8px">Limite disponível: <span class="mono negrito ${limiteDisponivel < 0 ? 'txt-vermelho' : 'txt-verde'}">${MF.Util.formatMoeda(limiteDisponivel)}</span></div>
      <div class="cartao-gastos">
        <div class="tabela-wrap">
          <table class="tabela">
            <thead><tr><th>Descrição</th><th>Tipo</th><th>Taxa</th><th>Valor Original</th><th>Juros/Total</th><th></th></tr></thead>
            <tbody class="corpo-gastos"></tbody>
          </table>
        </div>
        <button type="button" class="btn btn-sm btn-ghost btn-novo-gasto" style="margin-top:6px">+ NOVO GASTO</button>
      </div>` : ''}
    </div>
  `;

  const campoNome = div.querySelector('[data-campo="nome"]');
  const campoVenc = div.querySelector('[data-campo="vencimento"]');
  const campoLimite = div.querySelector('[data-campo="limite_total"]');
  const campoFatura = div.querySelector('[data-campo="fatura_atual"]');
  MF.Util.ligarMaiusculas(campoNome);
  MF.Util.ligarMascaraMoeda(campoLimite);
  MF.Util.ligarMascaraMoeda(campoFatura);

  if (cartao) {
    campoNome.value = cartao.nome || '';
    campoVenc.value = cartao.vencimento || '';
    MF.Util.definirValorMascaraMoeda(campoLimite, cartao.limite_total || 0);
    MF.Util.definirValorMascaraMoeda(campoFatura, cartao.fatura_atual || 0);
    [campoNome, campoVenc, campoLimite, campoFatura].forEach(c => c.addEventListener('blur', () => salvarEdicaoCartao(div, cartao)));

    div.querySelector('.cartao-item-cabecalho .chevron').addEventListener('click', (e) => { e.stopPropagation(); div.classList.toggle('recolhido'); });
    div.querySelector('.cartao-item-cabecalho').addEventListener('click', (ev) => {
      if (ev.target.tagName === 'INPUT' || ev.target.classList.contains('linha-excluir')) return;
      div.classList.toggle('recolhido');
    });
    div.querySelector('.linha-excluir')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Excluir o cartão "${cartao.nome}" e todos os seus gastos?`)) return;
      await MF.excluirCartao(cartao.id);
      MF.Util.toast('CARTÃO EXCLUÍDO');
      carregarTudo();
    });

    const corpoGastos = div.querySelector('.corpo-gastos');
    gastos.forEach(g => corpoGastos.appendChild(criarLinhaGasto(cartao.id, g)));
    corpoGastos.appendChild(criarLinhaGasto(cartao.id, null));

    div.querySelector('.btn-novo-gasto').addEventListener('click', () => {
      corpoGastos.querySelectorAll('tr[data-id="novo"] input.campo-nav')[0]?.focus();
    });
  } else {
    MF.Util.ligarNavegacaoEnter(div, () => salvarNovoCartao(div));
  }

  return div;
}

async function salvarNovoCartao(div) {
  const nome = div.querySelector('[data-campo="nome"]').value.trim();
  const vencimento = parseInt(div.querySelector('[data-campo="vencimento"]').value, 10);
  const limite_total = MF.Util.valorMascaraMoeda(div.querySelector('[data-campo="limite_total"]'));
  const fatura_atual = MF.Util.valorMascaraMoeda(div.querySelector('[data-campo="fatura_atual"]'));

  if (!nome) { MF.Util.toast('INFORME O NOME DO CARTÃO', 'erro'); return; }
  const novoId = await MF.salvarCartao({ nome, vencimento: vencimento || null, limite_total, fatura_atual, mes: periodo.mes, ano: periodo.ano });
  cartaoDraftAtivo = false;
  focoPendente = `.cartao-item[data-id="${novoId}"] .corpo-gastos tr[data-id="novo"] [data-campo="descricao"]`;
  MF.Util.toast('CARTÃO SALVO ✓');
  carregarTudo();
}

async function salvarEdicaoCartao(div, cartao) {
  const nome = div.querySelector('[data-campo="nome"]').value.trim();
  const vencimento = parseInt(div.querySelector('[data-campo="vencimento"]').value, 10);
  const limite_total = MF.Util.valorMascaraMoeda(div.querySelector('[data-campo="limite_total"]'));
  const fatura_atual = MF.Util.valorMascaraMoeda(div.querySelector('[data-campo="fatura_atual"]'));
  await MF.salvarCartao(Object.assign({}, cartao, { nome, vencimento: vencimento || null, limite_total, fatura_atual }));
  await carregarTudo();
}

function criarLinhaGasto(cartaoId, gasto) {
  const tr = document.createElement('tr');
  tr.dataset.id = gasto ? gasto.id : 'novo';
  if (!gasto) tr.classList.add('linha-nova');
  const tipo = gasto ? gasto.tipo : 'avista';

  tr.innerHTML = `
    <td data-rotulo="Descrição"><input class="campo maiusculas campo-nav" data-campo="descricao" placeholder="ALUGUEL, SUPERMERCADO..." /></td>
    <td data-rotulo="Tipo">
      <div class="toggle-2">
        <button type="button" class="btn-tipo ${tipo === 'avista' ? 'ativo pago' : ''}" data-tipo="avista">À VISTA</button>
        <button type="button" class="btn-tipo ${tipo === 'juros' ? 'ativo aberto' : ''}" data-tipo="juros">COM JUROS</button>
      </div>
    </td>
    <td data-rotulo="Taxa %"><input class="campo campo-taxa" data-campo="taxa_juros" inputmode="decimal" placeholder="3,5" style="display:${tipo === 'juros' ? 'block' : 'none'}; width:70px" /></td>
    <td data-rotulo="Valor Original" class="col-valor"><input class="campo campo-nav" data-campo="valor_original" inputmode="numeric" placeholder="R$ 0,00" /></td>
    <td data-rotulo="Juros/Total" class="gasto-linha-info"></td>
    <td class="col-acoes">${gasto ? '<button class="linha-excluir" title="Excluir">✕</button>' : ''}</td>
  `;

  const campoDesc = tr.querySelector('[data-campo="descricao"]');
  const campoTaxa = tr.querySelector('[data-campo="taxa_juros"]');
  const campoValor = tr.querySelector('[data-campo="valor_original"]');
  const infoCel = tr.querySelector('.gasto-linha-info');
  let tipoAtual = tipo;

  MF.Util.ligarMaiusculas(campoDesc);
  MF.Util.ligarMascaraMoeda(campoValor);

  function atualizarInfo() {
    const valorOriginal = MF.Util.valorMascaraMoeda(campoValor);
    if (tipoAtual === 'juros') {
      const taxa = MF.Util.parseDecimalBR(campoTaxa.value);
      const juros = valorOriginal * (taxa / 100);
      infoCel.innerHTML = `<span class="txt-vermelho">Juros: ${MF.Util.formatMoeda(juros)}</span><br>Total: ${MF.Util.formatMoeda(valorOriginal + juros)}`;
    } else {
      infoCel.textContent = MF.Util.formatMoeda(valorOriginal);
    }
  }

  tr.querySelectorAll('.btn-tipo').forEach(btn => {
    btn.addEventListener('click', () => {
      tipoAtual = btn.dataset.tipo;
      tr.querySelectorAll('.btn-tipo').forEach(b => b.classList.remove('ativo', 'pago', 'aberto'));
      btn.classList.add('ativo', tipoAtual === 'avista' ? 'pago' : 'aberto');
      campoTaxa.style.display = tipoAtual === 'juros' ? 'block' : 'none';
      atualizarInfo();
      if (gasto) salvarEdicaoGasto(tr, cartaoId, gasto);
    });
  });

  campoValor.addEventListener('input', atualizarInfo);
  if (campoTaxa) campoTaxa.addEventListener('input', atualizarInfo);

  if (gasto) {
    campoDesc.value = gasto.descricao || '';
    if (campoTaxa) campoTaxa.value = gasto.taxa_juros ? String(gasto.taxa_juros).replace('.', ',') : '';
    MF.Util.definirValorMascaraMoeda(campoValor, gasto.valor_original || 0);
    atualizarInfo();
    [campoDesc, campoTaxa, campoValor].forEach(c => c && c.addEventListener('blur', () => salvarEdicaoGasto(tr, cartaoId, gasto)));
    tr.querySelector('.linha-excluir').addEventListener('click', async () => {
      if (!confirm('Excluir este gasto?')) return;
      await MF.excluirGastoCartao(gasto.id);
      MF.Util.toast('EXCLUÍDO');
      carregarTudo();
    });
  } else {
    atualizarInfo();
  }

  MF.Util.ligarNavegacaoEnter(tr, () => {
    if (gasto) salvarEdicaoGasto(tr, cartaoId, gasto, true);
    else salvarNovoGasto(tr, cartaoId, tipoAtual);
  });
  return tr;
}

async function salvarNovoGasto(tr, cartaoId, tipoAtual) {
  const descricao = tr.querySelector('[data-campo="descricao"]').value.trim();
  const campoTaxa = tr.querySelector('[data-campo="taxa_juros"]');
  const valor_original = MF.Util.valorMascaraMoeda(tr.querySelector('[data-campo="valor_original"]'));
  if (!descricao) { MF.Util.toast('INFORME A DESCRIÇÃO DO GASTO', 'erro'); return; }

  const taxa_juros = tipoAtual === 'juros' ? MF.Util.parseDecimalBR(campoTaxa.value) : 0;
  const valor_juros = tipoAtual === 'juros' ? valor_original * (taxa_juros / 100) : 0;
  const valor_total = valor_original + valor_juros;

  focoPendente = `.cartao-item[data-id="${cartaoId}"] .corpo-gastos tr[data-id="novo"] [data-campo="descricao"]`;
  await MF.salvarGastoCartao({ cartao_id: cartaoId, descricao, tipo: tipoAtual, taxa_juros, valor_original, valor_juros, valor_total, mes: periodo.mes, ano: periodo.ano });
  MF.Util.toast('GASTO SALVO ✓');
  carregarTudo();
}

async function salvarEdicaoGasto(tr, cartaoId, gasto, notificar) {
  const descricao = tr.querySelector('[data-campo="descricao"]').value.trim();
  const campoTaxa = tr.querySelector('[data-campo="taxa_juros"]');
  const tipoAtual = tr.querySelector('.btn-tipo.ativo')?.dataset.tipo || gasto.tipo;
  const valor_original = MF.Util.valorMascaraMoeda(tr.querySelector('[data-campo="valor_original"]'));
  const taxa_juros = tipoAtual === 'juros' ? MF.Util.parseDecimalBR(campoTaxa.value) : 0;
  const valor_juros = tipoAtual === 'juros' ? valor_original * (taxa_juros / 100) : 0;
  const valor_total = valor_original + valor_juros;

  await MF.salvarGastoCartao(Object.assign({}, gasto, { cartao_id: cartaoId, descricao, tipo: tipoAtual, taxa_juros, valor_original, valor_juros, valor_total }));
  await carregarTudo();
  if (notificar) MF.Util.toast('ATUALIZADO ✓');
}

// -------------------------------------------------------------------- BACKUP

async function exportarComFeedback(idBotao, fn) {
  const btn = document.getElementById(idBotao);
  const textoOriginal = btn.textContent;
  btn.disabled = true; btn.textContent = 'GERANDO...';
  try {
    await fn();
    MF.Util.toast('EXPORTADO ✓');
  } catch (e) {
    console.error(e);
    MF.Util.toast('ERRO AO EXPORTAR', 'erro');
  } finally {
    btn.disabled = false; btn.textContent = textoOriginal;
  }
}

function nomeArquivoBackup(extensao) {
  const d = new Date();
  const aaaa = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `financeiro-backup-${aaaa}-${mm}-${dd}.${extensao}`;
}

function pedirSenhaBackup() {
  const senha1 = prompt('Digite uma senha para proteger o backup:');
  if (!senha1) return null;
  const senha2 = prompt('Digite a senha novamente para confirmar:');
  if (senha1 !== senha2) { alert('As senhas não coincidem. O backup será baixado sem senha.'); return null; }
  return senha1;
}

async function baixarBackup() {
  const dados = await MF.exportarTudo();
  const protegerComSenha = confirm('Proteger backup com senha? (recomendado)\n\nOK = com senha (arquivo cifrado)\nCancelar = sem senha (arquivo .json comum)');

  let blob, nomeArquivo;
  if (protegerComSenha) {
    const senha = pedirSenhaBackup();
    if (!senha) { MF.Util.toast('BACKUP CANCELADO', 'erro'); return; }
    const bytes = await MF.Util.cifrarBackup(dados, senha);
    blob = new Blob([bytes], { type: 'application/octet-stream' });
    nomeArquivo = nomeArquivoBackup('financeiro-backup');
  } else {
    blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    nomeArquivo = nomeArquivoBackup('json');
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
  MF.Util.toast('BACKUP BAIXADO ✓');
}

function restaurarBackup(ev) {
  const arquivo = ev.target.files[0];
  if (!arquivo) return;
  if (!confirm('Isso vai SUBSTITUIR todos os dados atuais pelos dados do backup. Continuar?')) { ev.target.value = ''; return; }

  const cifrado = arquivo.name.toLowerCase().endsWith('.financeiro-backup');
  const leitor = new FileReader();
  leitor.onload = async () => {
    try {
      let json;
      if (cifrado) {
        const senha = prompt('Digite a senha deste backup:');
        if (!senha) { ev.target.value = ''; return; }
        json = await MF.Util.decifrarBackup(new Uint8Array(leitor.result), senha);
      } else {
        json = JSON.parse(leitor.result);
      }
      await MF.importarBackup(json);
      MF.Util.toast('BACKUP RESTAURADO ✓');
      carregarTudo();
    } catch (e) {
      console.error(e);
      MF.Util.toast(cifrado ? 'SENHA INCORRETA OU ARQUIVO INVÁLIDO' : 'ARQUIVO DE BACKUP INVÁLIDO', 'erro');
    } finally {
      ev.target.value = '';
    }
  };
  if (cifrado) leitor.readAsArrayBuffer(arquivo);
  else leitor.readAsText(arquivo);
}
