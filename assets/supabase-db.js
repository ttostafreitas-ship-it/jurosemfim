const MF = (() => {
  const tables = {
    lancamentos: "lancamentos",
    cartoes: "cartoes",
    gastos_cartao: "gastos_cartao",
    historico_anual: "historico_anual",
    configuracoes: "configuracoes",
  };

  async function user() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error("Sessão expirada. Entre novamente.");
    return data.user;
  }

  async function query(operation) {
    try {
      await user();
      const result = await operation();
      if (result.error) throw result.error;
      return result.data;
    } catch (error) {
      console.error("Erro ao acessar o banco de dados:", error);
      MF.Util.toast("Erro ao acessar o banco de dados local. Verifique sua sessão e conexão.", "erro");
      throw error;
    }
  }

  function own(record) {
    return { ...record, user_id: record.user_id || undefined };
  }

  const Util = {
    formatMoeda: value => (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    formatNumero: (value, digits = 2) => (Number(value) || 0).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    formatPercent: (value, digits = 1) => `${(Number(value) || 0).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`,
    parseDecimalBR(value) { if (typeof value === "number") return value; return Number(String(value || "").trim().replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0; },
    nomeMes: (month, short = false) => (short ? ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"] : ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"])[Math.max(1, Math.min(12, Number(month))) - 1],
    hojeBR() { const date = new Date(); return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(2)}`; },
    mesAnoAtual() { const date = new Date(); return { mes: date.getMonth() + 1, ano: date.getFullYear() }; },
    parseDataBR(value) { const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/); if (!match) return null; let year = Number(match[3]); if (year < 100) year += 2000; return { dia: Number(match[1]), mes: Number(match[2]), ano: year }; },
    aplicarMascaraData(value) { const digits = String(value || "").replace(/\D/g, "").slice(0, 8); return digits.length > 4 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}` : digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits; },
    ligarMascaraData(input) { input.addEventListener("input", () => { input.value = Util.aplicarMascaraData(input.value); }); },
    ligarMaiusculas(input) { input?.addEventListener("input", () => { const position = input.selectionStart; input.value = input.value.toUpperCase(); input.setSelectionRange(position, position); }); },
    ligarMascaraMoeda(input) { input.dataset.cents = input.dataset.cents || "0"; const render = () => { input.value = Number(input.dataset.cents) ? Util.formatMoeda(Number(input.dataset.cents) / 100) : ""; }; input.addEventListener("keydown", event => { if (/^\d$/.test(event.key)) { event.preventDefault(); input.dataset.cents = `${input.dataset.cents}${event.key}`.replace(/^0+(?=\d)/, "").slice(0, 13); render(); } else if (event.key === "Backspace") { event.preventDefault(); input.dataset.cents = input.dataset.cents.slice(0, -1) || "0"; render(); } else if (!["Tab", "Enter", "ArrowLeft", "ArrowRight", "Shift"].includes(event.key)) event.preventDefault(); }); render(); },
    valorMascaraMoeda(input) { return Number(input?.dataset.cents || 0) / 100; },
    definirValorMascaraMoeda(input, value) { input.dataset.cents = String(Math.round(Number(value || 0) * 100)); input.value = Number(value || 0) ? Util.formatMoeda(value) : ""; },
    ligarNavegacaoEnter(container, submit) { const fields = [...container.querySelectorAll(".campo-nav")]; fields.forEach((field, index) => field.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); index < fields.length - 1 ? fields[index + 1].focus() : submit(); } })); },
    async cifrarBackup(data, password) { const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12)); const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]); const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]); const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(data)))); const result = new Uint8Array(28 + encrypted.length); result.set(salt); result.set(iv, 16); result.set(encrypted, 28); return result; },
    async decifrarBackup(bytes, password) { const salt = bytes.slice(0, 16); const iv = bytes.slice(16, 28); const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]); const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]); const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, bytes.slice(28)); return JSON.parse(new TextDecoder().decode(plain)); },
    escapeHtml(value) { const element = document.createElement("div"); element.textContent = String(value ?? ""); return element.innerHTML; },
    toast(message = "SALVO", type = "ok") { const element = document.getElementById("mf-toast") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "mf-toast" })); element.textContent = message; element.className = `mf-toast mf-toast--${type} mf-toast--visivel`; setTimeout(() => element.classList.remove("mf-toast--visivel"), 2500); },
  };

  async function save(table, record) { const currentUser = await user(); return query(() => supabase.from(table).upsert({ ...record, user_id: currentUser.id }).select().single()); }
  async function remove(table, id) { return query(() => supabase.from(table).delete().eq("id", id)); }
  async function all(table) { return query(() => supabase.from(table).select("*")); }
  async function byPeriod(table, month, year) { return query(() => supabase.from(table).select("*").eq("mes", month).eq("ano", year).order("created_at")); }

  const api = {
    abrirBanco: async () => true,
    Util,
    Auth: { exigirPin: () => MFAuth.requireSession() },
    salvarLancamento: record => save(tables.lancamentos, record),
    excluirLancamento: id => remove(tables.lancamentos, id),
    buscarLancamentoPorId: id => query(() => supabase.from(tables.lancamentos).select("*").eq("id", id).single()),
    buscarPorMesAno: async (month, year) => { const rows = await byPeriod(tables.lancamentos, month, year); return { entradas: rows.filter(row => row.tipo === "entrada"), saidas: rows.filter(row => row.tipo === "saida") }; },
    buscarSaidasPorSituacao: async (situation, month, year) => (await api.buscarPorMesAno(month, year)).saidas.filter(row => row.situacao === situation),
    buscarAnosDisponiveis: async () => { const [launches, history] = await Promise.all([all(tables.lancamentos), all(tables.historico_anual)]); return [...new Set([...launches, ...history].map(row => row.ano).concat(new Date().getFullYear()))].sort((a, b) => b - a); },
    salvarHistoricoAnualManual: record => save(tables.historico_anual, record),
    buscarHistoricoAnual: async year => { const [launches, manual] = await Promise.all([query(() => supabase.from(tables.lancamentos).select("*").eq("ano", year)), query(() => supabase.from(tables.historico_anual).select("*").eq("ano", year))]); return Array.from({ length: 12 }, (_, index) => { const month = index + 1; const rows = launches.filter(row => row.mes === month); const summary = manual.find(row => row.mes === month); const entries = rows.filter(row => row.tipo === "entrada").reduce((sum, row) => sum + Number(row.valor || 0), 0); const expenses = rows.filter(row => row.tipo === "saida" && !["atrasada", "urgente"].includes(row.situacao)).reduce((sum, row) => sum + Number(row.valor_pago ?? row.valor ?? 0), 0); const open = rows.filter(row => row.tipo === "saida" && ["atrasada", "urgente"].includes(row.situacao)).reduce((sum, row) => sum + Number(row.valor_pago ?? row.valor ?? 0), 0); return { ano: year, mes: month, total_entradas: rows.length ? entries : summary?.total_entradas || 0, total_saidas: rows.length ? expenses : summary?.total_saidas || 0, total_aberto: rows.length ? open : summary?.total_aberto || 0, origem: rows.length ? "lancamentos" : summary ? "manual" : "vazio" }; }); },
    salvarConfiguracao: async (key, value) => { const currentUser = await user(); const allowed = ["logo_url", "senha_trocada", "plano", "plano_expira"]; if (!allowed.includes(key)) return null; return query(() => supabase.from(tables.configuracoes).upsert({ user_id: currentUser.id, [key]: value }, { onConflict: "user_id" }).select().single()); },
    buscarConfiguracao: async key => { const currentUser = await user(); const row = await query(() => supabase.from(tables.configuracoes).select(key).eq("user_id", currentUser.id).single()); return row?.[key] ?? null; },
    salvarCartao: record => save(tables.cartoes, record),
    excluirCartao: async id => { await query(() => supabase.from(tables.gastos_cartao).delete().eq("cartao_id", id)); await remove(tables.cartoes, id); },
    buscarCartaoPorId: id => query(() => supabase.from(tables.cartoes).select("*").eq("id", id).single()),
    buscarCartoes: (month, year) => byPeriod(tables.cartoes, month, year),
    salvarGastoCartao: record => save(tables.gastos_cartao, { ...record, tipo_cobranca: record.tipo_cobranca || record.tipo }),
    excluirGastoCartao: id => remove(tables.gastos_cartao, id),
    buscarGastosPorCartao: (cardId, month, year) => query(() => supabase.from(tables.gastos_cartao).select("*").eq("cartao_id", cardId).eq("mes", month).eq("ano", year)),
    calcularJurosTotais: async (month, year) => { const cards = await api.buscarCartoes(month, year); const expenses = await byPeriod(tables.gastos_cartao, month, year); const interest = expenses.reduce((sum, row) => sum + Number(row.valor_juros || 0), 0); const total = expenses.reduce((sum, row) => sum + Number(row.valor_total || 0), 0); const income = (await api.buscarPorMesAno(month, year)).entradas.reduce((sum, row) => sum + Number(row.valor || 0), 0); return { totalJuros: interest, totalSemJuros: total - interest, totalGastosCartao: total, faturaTotal: cards.reduce((sum, row) => sum + Number(row.fatura_atual || 0), 0), percentualFatura: 0, percentualRenda: income ? interest / income * 100 : 0 }; },
    vincularSaidaAoCartao: async (expenseId, cardId, amount) => save(tables.lancamentos, { id: expenseId, situacao: "cartao", cartao_vinculado_id: cardId, valor_pago: amount }),
    exportarTudo: async () => { const [lancamentos, historico_anual, configuracoes, cartoes, gastos_cartao] = await Promise.all(Object.values(tables).map(all)); return { versao: 2, exportado_em: new Date().toISOString(), lancamentos, historico_anual, configuracoes, cartoes, gastos_cartao }; },
    importarBackup: async backup => { for (const table of [tables.lancamentos, tables.historico_anual, tables.configuracoes, tables.cartoes, tables.gastos_cartao]) for (const row of backup[table] || []) await save(table, row); return true; },
    checkPlano: () => api.buscarConfiguracao("plano"),
  };

  return api;
})();
