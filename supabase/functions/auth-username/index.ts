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
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Email inválido." }, 400);
      if (profile) return json({ error: "Não foi possível criar o cadastro." }, 409);
      const temporaryPassword = `${crypto.randomUUID().replaceAll("-", "").slice(0, 11)}A`;
      const created = await admin.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true, user_metadata: { username } });
      if (created.error) return json({ error: "Não foi possível criar o cadastro." }, 400);
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const sender = Deno.env.get("EMAIL_FROM");
      if (!resendKey || !sender) {
        await admin.auth.admin.deleteUser(created.data.user.id);
        return json({ error: "O envio de email ainda não está configurado." }, 503);
      }
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: sender,
          to: email,
          subject: "Sua senha temporária - Meu Financeiro",
          text: `Seu nome de usuário: ${username}\n\nSenha temporária: ${temporaryPassword}\n\nTroque a senha após entrar.`,
        }),
      });
      if (!emailResponse.ok) {
        // DIAGNÓSTICO: devolve o motivo exato da recusa do Resend (status + corpo).
        // Depois de identificar a causa, volte esta mensagem para algo genérico.
        const detalhe = await emailResponse.text().catch(() => "");
        console.error("Resend recusou o envio:", emailResponse.status, "from=", sender, "to=", email, detalhe);
        await admin.auth.admin.deleteUser(created.data.user.id);
        return json({
          error: `Resend recusou [HTTP ${emailResponse.status}] (from: ${sender}) - ${detalhe.slice(0, 400)}`,
        }, 502);
      }
      return json({ ok: true, email_sent: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: "Erro interno de autenticação." }, 500);
  }
});
