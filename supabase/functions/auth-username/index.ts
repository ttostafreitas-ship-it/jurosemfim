import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const publicClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
);

function validUsername(username: unknown) {
  return typeof username === "string" && /^[a-zA-Z0-9_.-]{3,32}$/.test(username);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { action, username, email, password } = await request.json();
    if (!validUsername(username)) return json({ error: "Nome de usuário inválido." }, 400);

    const { data: profile } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();

    if (action === "sign_in") {
      if (!profile?.id) return json({ error: "Usuário ou senha inválidos." }, 401);
      const authUser = await admin.auth.admin.getUserById(profile.id);
      if (authUser.error || !authUser.data.user?.email) return json({ error: "Usuário ou senha inválidos." }, 401);
      const result = await publicClient.auth.signInWithPassword({ email: authUser.data.user.email, password });
      if (result.error) return json({ error: "Usuário ou senha inválidos." }, 401);
      return json(result.data);
    }

    if (action === "recover") {
      if (profile?.id) {
        const authUser = await admin.auth.admin.getUserById(profile.id);
        if (authUser.data.user?.email) await admin.auth.resetPasswordForEmail(authUser.data.user.email, { redirectTo: `${Deno.env.get("SITE_URL")}/login.html` });
      }
      return json({ ok: true });
    }

    if (action === "username_available") {
      return json({ available: !profile });
    }

    if (action === "sign_up") {
      // A pessoa escolhe a própria senha no cadastro — nada de email/Resend.
      if (typeof password !== "string" || password.length < 8) {
        return json({ error: "A senha precisa de pelo menos 8 caracteres." }, 400);
      }
      if (profile) return json({ error: "Este nome de usuário já está em uso." }, 409);

      // Email é opcional (só serviria para recuperação futura). Sem email
      // informado, cria um endereço interno sintético — o login é sempre
      // por nome de usuário, esse endereço nunca recebe nada.
      const informouEmail = typeof email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
      const authEmail = informouEmail ? email : `${username.toLowerCase()}@no-reply.meu-financeiro.app`;

      const created = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { username },
      });
      if (created.error) {
        return json({ error: "Não foi possível criar o cadastro. Tente outro nome de usuário." }, 400);
      }
      return json({ ok: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: "Erro interno de autenticação." }, 500);
  }
});
