# Configuração do Supabase

## 1. Criar o projeto

1. Crie um projeto no Supabase.
2. Abra o SQL Editor e execute `supabase/schema.sql`.
3. Em Authentication > URL Configuration, configure:
   - Site URL: `https://ttostafreitas-ship-it.github.io/meu-financeiro`
   - Redirect URL: `https://ttostafreitas-ship-it.github.io/meu-financeiro/login.html`
4. Em Authentication > Providers, deixe Email habilitado.
5. Configure um provedor SMTP ou transacional para emails de recuperação.

## 2. Configurar o frontend

Edite `assets/supabase-config.js` usando apenas:

- Project URL
- anon public key

A `service_role key` nunca deve aparecer em HTML, JavaScript publicado ou GitHub.

## 3. Publicar a Edge Function

A função `supabase/functions/auth-username/index.ts` precisa ser publicada com a Supabase CLI. Configure os secrets no ambiente da função:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGIN=https://ttostafreitas-ship-it.github.io`
- `SITE_URL=https://ttostafreitas-ship-it.github.io/meu-financeiro`
- `RESEND_API_KEY`
- `EMAIL_FROM` com um remetente verificado no Resend

A chave `SUPABASE_SERVICE_ROLE_KEY` só é usada dentro da Edge Function. Ela não pode ser colocada em `assets/`.

## 4. Deploy

```text
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy auth-username --no-verify-jwt
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... RESEND_API_KEY=... EMAIL_FROM=...
```

A função valida o username no servidor, faz o login usando o email privado do perfil e nunca devolve esse email ao navegador. O login recebe apenas a sessão Supabase.

## 5. Testes obrigatórios

- Criar username válido e email de recuperação.
- Confirmar recebimento da senha temporária.
- Entrar com username e senha.
- Tentar entrar com username inexistente e confirmar mensagem genérica.
- Solicitar recuperação e confirmar que a mensagem não revela se o username existe.
- Abrir `index.html` sem sessão e confirmar redirecionamento para `login.html`.
- Consultar tabelas com dois usuários e confirmar que cada um só vê seus próprios registros.
- Tentar alterar `user_id` pelo navegador e confirmar rejeição por RLS/trigger.
- Testar backup cifrado e restauração com senha errada.
- Confirmar que a `service_role key` não aparece no bundle, no HTML ou no histórico do Git.
