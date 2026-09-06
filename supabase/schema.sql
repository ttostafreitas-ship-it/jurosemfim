-- Execute no SQL Editor do Supabase.
-- A senha nunca e armazenada nestas tabelas; fica no Supabase Auth.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-zA-Z0-9_\.\-]{3,32}$')
);

create table if not exists public.configuracoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  logo_url text,
  senha_trocada boolean not null default false,
  plano text not null default 'gratuito' check (plano in ('gratuito', 'basico', 'pro')),
  plano_expira timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.cartoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  vencimento integer not null check (vencimento between 1 and 31),
  limite_total numeric(12,2) not null default 0 check (limite_total >= 0),
  fatura_atual numeric(12,2) not null default 0 check (fatura_atual >= 0),
  mes integer not null check (mes between 1 and 12),
  ano integer not null check (ano between 2000 and 2200),
  created_at timestamptz not null default now()
);

create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  descricao text not null,
  origem text not null default '',
  valor numeric(12,2) not null check (valor >= 0),
  data date not null,
  situacao text check (situacao in ('atrasada', 'urgente', 'cartao', 'emdia')),
  valor_pago numeric(12,2) check (valor_pago is null or valor_pago >= 0),
  dias_atraso integer check (dias_atraso is null or dias_atraso >= 0),
  data_limite date,
  cartao_vinculado_id uuid references public.cartoes(id) on delete set null,
  mes integer not null check (mes between 1 and 12),
  ano integer not null check (ano between 2000 and 2200),
  created_at timestamptz not null default now()
);

create table if not exists public.gastos_cartao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cartao_id uuid not null references public.cartoes(id) on delete cascade,
  descricao text not null,
  tipo_cobranca text not null check (tipo_cobranca in ('avista', 'juros')),
  taxa_juros numeric(5,2) not null default 0 check (taxa_juros >= 0),
  valor_original numeric(12,2) not null check (valor_original >= 0),
  valor_juros numeric(12,2) not null default 0 check (valor_juros >= 0),
  valor_total numeric(12,2) not null check (valor_total >= 0),
  mes integer not null check (mes between 1 and 12),
  ano integer not null check (ano between 2000 and 2200),
  created_at timestamptz not null default now()
);

create table if not exists public.historico_anual (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ano integer not null check (ano between 2000 and 2200),
  mes integer not null check (mes between 1 and 12),
  total_entradas numeric(12,2) not null default 0,
  total_saidas numeric(12,2) not null default 0,
  total_aberto numeric(12,2) not null default 0,
  saldo numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, ano, mes)
);

create index if not exists lancamentos_user_ano_mes_idx on public.lancamentos(user_id, ano, mes);
create index if not exists cartoes_user_ano_mes_idx on public.cartoes(user_id, ano, mes);
create index if not exists gastos_cartao_user_cartao_idx on public.gastos_cartao(user_id, cartao_id);
create index if not exists historico_anual_user_ano_idx on public.historico_anual(user_id, ano);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
  );
  insert into public.configuracoes (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.configuracoes enable row level security;
alter table public.lancamentos enable row level security;
alter table public.cartoes enable row level security;
alter table public.gastos_cartao enable row level security;
alter table public.historico_anual enable row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = id);
create policy profiles_update_own on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Reutiliza a mesma politica para todas as tabelas com user_id.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['configuracoes','lancamentos','cartoes','gastos_cartao','historico_anual'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_own', table_name);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', table_name || '_delete_own', table_name);
  end loop;
end;
$$;

-- Impede que um cliente altere o dono de um registro via update.
create or replace function public.prevent_user_id_change()
returns trigger language plpgsql as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'user_id nao pode ser alterado';
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['configuracoes','lancamentos','cartoes','gastos_cartao','historico_anual'] loop
    execute format('drop trigger if exists %I on public.%I', 'prevent_' || table_name || '_user_change', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.prevent_user_id_change()', 'prevent_' || table_name || '_user_change', table_name);
  end loop;
end;
$$;
