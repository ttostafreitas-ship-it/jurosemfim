(() => {
  const AUTH_KEY = "conta_usuario";
  const SESSION_KEY = "mf_usuario_ok";
  const MIN_PASSWORD_LENGTH = 6;

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatCpf(value) {
    const digits = onlyDigits(value).slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function isValidCpf(value) {
    const cpf = onlyDigits(value);
    if (cpf.length !== 11 || /^([0-9])\1{10}$/.test(cpf)) return false;

    let sum = 0;
    for (let index = 0; index < 9; index += 1) sum += Number(cpf[index]) * (10 - index);
    let digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    if (digit !== Number(cpf[9])) return false;

    sum = 0;
    for (let index = 0; index < 10; index += 1) sum += Number(cpf[index]) * (11 - index);
    digit = (sum * 10) % 11;
    if (digit === 10) digit = 0;
    return digit === Number(cpf[10]);
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function hashPassword(password, salt) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
      key,
      256,
    );
    return bytesToHex(new Uint8Array(bits));
  }

  function sameText(left, right) {
    if (left.length !== right.length) return false;
    let result = 0;
    for (let index = 0; index < left.length; index += 1) {
      result |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return result === 0;
  }

  async function getAccount() {
    return MF.buscarConfiguracao(AUTH_KEY, null);
  }

  async function saveAccount(cpf, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await hashPassword(password, salt);
    await MF.salvarConfiguracao(AUTH_KEY, {
      cpf,
      salt: bytesToHex(salt),
      passwordHash: hash,
      criadoEm: new Date().toISOString(),
    });
  }

  function createOverlay(hasAccount) {
    const overlay = document.createElement("div");
    overlay.id = "mf-auth-overlay";
    overlay.innerHTML = `
      <div class="mf-auth-box">
        <div class="mf-auth-brand">MEU FINANCEIRO</div>
        <h1 id="mf-auth-title">${hasAccount ? "Entrar" : "Criar cadastro"}</h1>
        <p id="mf-auth-message">${hasAccount ? "Informe seu CPF e senha para continuar." : "Cadastre seu CPF e crie uma senha para proteger seus lançamentos."}</p>
        <form id="mf-auth-form" novalidate>
          <label class="mf-auth-field">
            <span>CPF</span>
            <input id="mf-auth-cpf" class="campo" inputmode="numeric" autocomplete="username" maxlength="14" placeholder="000.000.000-00" required />
          </label>
          <label class="mf-auth-field">
            <span>Senha</span>
            <input id="mf-auth-password" class="campo" type="password" autocomplete="current-password" minlength="${MIN_PASSWORD_LENGTH}" required />
          </label>
          <label class="mf-auth-field ${hasAccount ? "mf-auth-hidden" : ""}" id="mf-auth-confirm-field">
            <span>Confirmar senha</span>
            <input id="mf-auth-confirm" class="campo" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" ${hasAccount ? "disabled" : "required"} />
          </label>
          <div id="mf-auth-error" class="mf-auth-error" role="alert"></div>
          <button type="submit" class="btn btn-primario mf-auth-submit">${hasAccount ? "ENTRAR" : "CRIAR CADASTRO"}</button>
        </form>
        <button type="button" id="mf-auth-toggle" class="mf-auth-link">${hasAccount ? "Criar novo cadastro" : "Já tenho cadastro"}</button>
        <button type="button" id="mf-auth-forgot" class="mf-auth-link">Esqueci minha senha</button>
        <p class="mf-auth-note">Seus dados ficam somente neste navegador. A senha não pode ser recuperada.</p>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showError(message) {
    const error = document.getElementById("mf-auth-error");
    error.textContent = message;
    error.classList.add("visivel");
  }

  async function requireAuthentication() {
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
    await MF.abrirBanco();

    let account = await getAccount();
    let createMode = !account;
    const overlay = createOverlay(Boolean(account));
    const form = overlay.querySelector("#mf-auth-form");
    const cpfInput = overlay.querySelector("#mf-auth-cpf");
    const passwordInput = overlay.querySelector("#mf-auth-password");
    const confirmInput = overlay.querySelector("#mf-auth-confirm");
    const title = overlay.querySelector("#mf-auth-title");
    const message = overlay.querySelector("#mf-auth-message");
    const submit = overlay.querySelector(".mf-auth-submit");
    const toggle = overlay.querySelector("#mf-auth-toggle");

    cpfInput.addEventListener("input", () => {
      cpfInput.value = formatCpf(cpfInput.value);
    });

    toggle.addEventListener("click", () => {
      createMode = !createMode;
      title.textContent = createMode ? "Criar cadastro" : "Entrar";
      message.textContent = createMode
        ? "Cadastre seu CPF e crie uma senha para proteger seus lançamentos."
        : "Informe seu CPF e senha para continuar.";
      submit.textContent = createMode ? "CRIAR CADASTRO" : "ENTRAR";
      toggle.textContent = createMode ? "Já tenho cadastro" : "Criar novo cadastro";
      confirmInput.disabled = !createMode;
      confirmInput.required = createMode;
      confirmInput.parentElement.classList.toggle("mf-auth-hidden", !createMode);
      passwordInput.autocomplete = createMode ? "new-password" : "current-password";
      showError("");
    });

    overlay.querySelector("#mf-auth-forgot").addEventListener("click", () => {
      alert("Por segurança, a senha não pode ser recuperada. Para criar outro cadastro, será necessário apagar os dados deste site, o que também apagará os lançamentos locais.");
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const cpf = onlyDigits(cpfInput.value);
      const password = passwordInput.value;

      if (!isValidCpf(cpf)) return showError("Digite um CPF válido.");
      if (password.length < MIN_PASSWORD_LENGTH) return showError(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      if (createMode && password !== confirmInput.value) return showError("As senhas não coincidem.");

      submit.disabled = true;
      try {
        account = await getAccount();
        if (createMode) {
          if (account) return showError("Já existe um cadastro neste navegador. Entre com ele.");
          await saveAccount(cpf, password);
        } else {
          if (!account || account.cpf !== cpf) return showError("CPF ou senha inválidos.");
          const salt = Uint8Array.from(account.salt.match(/.{2}/g).map((part) => parseInt(part, 16)));
          const hash = await hashPassword(password, salt);
          if (!sameText(hash, account.passwordHash)) return showError("CPF ou senha inválidos.");
        }
        sessionStorage.setItem(SESSION_KEY, "1");
        overlay.remove();
      } catch (error) {
        console.error("Erro na autenticação:", error);
        showError("Não foi possível concluir a autenticação. Tente novamente.");
      } finally {
        submit.disabled = false;
      }
    });

    setTimeout(() => cpfInput.focus(), 50);
  }

  MF.Auth.exigirPin = requireAuthentication;
})();
