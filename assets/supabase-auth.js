(() => {
  const EDGE_FUNCTION = "auth-username";

  function message(error) {
    return error?.message || "Não foi possível concluir a operação.";
  }

  async function invoke(action, payload) {
    const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION, {
      body: { action, ...payload },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function signIn(username, password) {
    const result = await invoke("sign_in", { username, password });
    if (!result?.session?.access_token || !result?.session?.refresh_token) {
      throw new Error("Sessão de autenticação inválida.");
    }
    const { data, error } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (error) throw error;
    return data;
  }

  async function signUp(username, email) {
    return invoke("sign_up", { username, email });
  }

  async function recover(username) {
    return invoke("recover", { username });
  }

  async function usernameAvailable(username) {
    return invoke("username_available", { username });
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.location.href = "login.html";
  }

  async function requireSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      window.location.href = "login.html";
      return null;
    }
    return data.session;
  }

  async function changePassword(currentPassword, nextPassword) {
    if (!/^.{8,}$/.test(nextPassword) || !/[A-Z]/.test(nextPassword) || !/[0-9]/.test(nextPassword)) {
      throw new Error("A nova senha deve ter 8 caracteres, uma maiúscula e um número.");
    }
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) throw error;
    const { data: userData } = await supabase.auth.getUser();
    return supabase.from("configuracoes").update({ senha_trocada: true }).eq("user_id", userData.user.id);
  }

  window.MFAuth = { signIn, signUp, recover, usernameAvailable, signOut, requireSession, changePassword, message };
})();
