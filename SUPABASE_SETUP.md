# Configuração do Supabase

## 1. Criar o projeto

1. Crie um projeto no Supabase.
2. Abra o **SQL Editor** e execute `supabase/schema.sql` inteiro. Ele cria
   as tabelas, o RLS, os triggers **e os GRANTs** de tabela para os roles
   `authenticated` e `service_role` (sem esses GRANTs o login falha em
   "Usuário ou senha inválidos" e o app não lê nada depois de logar).
3. Em **Authentication > URL Configuration**:
   - Site URL: `https://ttostafreitas-ship-it.github.io/meu-financeiro`
   - Redirect URL: `https://ttostafreitas-ship-it.github.io/meu-financeiro/login.html`
4. Em **Authentication > Providers**, deixe **Email** habilitado (é o
   provider usado internamente; o app não envia email no cadastro).

## 2. Configurar o frontend

Edite `assets/supabase-config.js` com:

- **Project URL**
- **anon public key**

A `service_role key` **nunca** deve aparecer em HTML, JavaScript publicado
ou no Git.

## 3. Publicar a Edge Function

A função `supabase/functions/auth-username/index.ts` faz o mapa
nome-de-usuário → conta (cadastro e login). Publique-a pela CLI **ou** pelo
editor do painel (Edge Functions → auth-username → Deploy).

Secrets necessários no ambiente da função:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGIN=https://ttostafreitas-ship-it.github.io`
- `SITE_URL=https://ttostafreitas-ship-it.github.io/meu-financeiro`

> Não há mais dependência de Resend / envio de email. No cadastro a pessoa
> escolhe a própria senha; o email é opcional (só serviria para
> recuperação futura, que exigiria um SMTP configurado em
> Authentication > Email).

## 4. Deploy

```text
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy auth-username --no-verify-jwt
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... ALLOWED_ORIGIN=... SITE_URL=...
```

O login nunca devolve o email/identidade da conta ao navegador — só a
sessão do Supabase.

## 5. Testes

- Cadastrar com nome de usuário + senha (≥ 8 caracteres), sem email, e
  confirmar que entra direto.
- Sair e entrar de novo com o mesmo usuário + senha.
- Tentar entrar com usuário inexistente → "Usuário ou senha inválidos."
- Tentar cadastrar o mesmo nome de usuário 2x → "já está em uso".
- Abrir `index.html` sem sessão → redireciona para `login.html`.
- Com dois usuários, confirmar que cada um só vê os próprios lançamentos.
- Tentar alterar `user_id` de um registro pelo navegador → rejeitado por
  RLS/trigger.
- Testar backup cifrado e restauração com senha errada.
- Confirmar que a `service_role key` não aparece no bundle, no HTML nem no
  histórico do Git.
