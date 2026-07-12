import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const env = Object.fromEntries(
  envContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separatorIndex = line.indexOf('=');
      return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
    }),
);

const supabaseUrl = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Variaveis do Supabase ausentes em .env.local');
}

const sql = `
create extension if not exists pgcrypto;

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  created_at timestamp with time zone default now()
);

create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  position integer default 0,
  created_at timestamp with time zone default now()
);

create table if not exists tabs (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references sections(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  position integer default 0,
  created_at timestamp with time zone default now()
);

create table if not exists tab_contents (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid references tabs(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  content text,
  updated_at timestamp with time zone default now()
);

create table if not exists modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  content text,
  file_url text,
  module_type text not null default 'html',
  status text not null default 'novo',
  is_public boolean not null default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table modules
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists title text,
  add column if not exists content text,
  add column if not exists file_url text,
  add column if not exists module_type text not null default 'html',
  add column if not exists status text not null default 'novo',
  add column if not exists is_public boolean not null default false,
  add column if not exists created_at timestamp with time zone default now(),
  add column if not exists updated_at timestamp with time zone default now();

alter table workspaces enable row level security;
alter table sections enable row level security;
alter table tabs enable row level security;
alter table tab_contents enable row level security;
alter table modules enable row level security;

drop policy if exists "user owns workspace" on workspaces;
drop policy if exists "user owns section" on sections;
drop policy if exists "user owns tab" on tabs;
drop policy if exists "user owns content" on tab_contents;
drop policy if exists "user owns module" on modules;
drop policy if exists "public modules are readable" on modules;

create policy "user owns workspace" on workspaces for all using (auth.uid() = user_id);
create policy "user owns section" on sections for all using (auth.uid() = user_id);
create policy "user owns tab" on tabs for all using (auth.uid() = user_id);
create policy "user owns content" on tab_contents for all using (auth.uid() = user_id);
create policy "user owns module" on modules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public modules are readable" on modules for select using (is_public = true or auth.uid() = user_id);
`;

const executeSql = async () => {
  const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ sql }),
  });

  const rpcText = await rpcResponse.text();

  if (!rpcResponse.ok) {
    throw new Error(`Falha ao executar SQL: ${rpcResponse.status} ${rpcText}`);
  }

  const verifyResponse = await fetch(
    `${supabaseUrl}/rest/v1/modules?select=id&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );

  const verifyText = await verifyResponse.text();

  if (!verifyResponse.ok) {
    throw new Error(`Falha ao validar tabela modules: ${verifyResponse.status} ${verifyText}`);
  }

  console.log('Tabela modules validada com sucesso.');
};

executeSql().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
