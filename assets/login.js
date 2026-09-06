const form = document.getElementById("auth-form");
const modeButtons = document.querySelectorAll("[data-mode]");
const emailField = document.getElementById("email-field");
const passwordField = document.getElementById("password-field");
const email = document.getElementById("email");
const password = document.getElementById("password");
const submit = document.querySelector(".auth-submit");
const forgot = document.getElementById("forgot");
const title = document.getElementById("auth-title");
const description = document.getElementById("auth-description");
const status = document.getElementById("auth-status");
let mode = "login";
let usernameTimer;

function setStatus(text, type = "") {
  status.textContent = text;
  status.className = `auth-status ${type}`;
}

function setMode(nextMode) {
  mode = nextMode;
  const signup = mode === "signup";
  modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  title.textContent = signup ? "Criar cadastro" : "Entrar";
  description.textContent = signup
    ? "Escolha um nome de usuário e informe um email para recuperação."
    : "Acesse seus lançamentos com seu nome de usuário.";
  emailField.classList.toggle("hidden", !signup);
  email.required = signup;
  passwordField.classList.toggle("hidden", signup);
  password.required = !signup;
  submit.textContent = signup ? "CADASTRAR" : "ENTRAR";
  forgot.classList.toggle("hidden", signup);
  setStatus("");
}

modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));

document.getElementById("username").addEventListener("input", () => {
  if (mode !== "signup") return;
  clearTimeout(usernameTimer);
  const username = document.getElementById("username").value.trim();
  if (username.length < 3) return;
  usernameTimer = setTimeout(async () => {
    try {
      const result = await MFAuth.usernameAvailable(username);
      setStatus(result.available ? "Nome de usuário disponível." : "Nome de usuário indisponível.", result.available ? "ok" : "error");
    } catch (_) {
      setStatus("Não foi possível verificar o nome agora.", "error");
    }
  }, 350);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submit.disabled = true;
  try {
    const username = document.getElementById("username").value.trim();
    if (mode === "signup") {
      await MFAuth.signUp(username, email.value.trim());
      setStatus("Cadastro realizado. Verifique seu email para receber as instruções de acesso.", "ok");
      form.reset();
    } else {
      await MFAuth.signIn(username, password.value);
      window.location.href = "index.html";
    }
  } catch (error) {
    setStatus(MFAuth.message(error), "error");
  } finally {
    submit.disabled = false;
  }
});

forgot.addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  if (!username) {
    setStatus("Informe seu nome de usuário.", "error");
    return;
  }
  try {
    await MFAuth.recover(username);
  } catch (_) {
    // Keep the same response to avoid revealing whether the username exists.
  }
  setStatus("Se o usuário existir, você receberá um email com o link de recuperação.", "ok");
});
