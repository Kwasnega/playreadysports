-- Roles enum
create type public.app_role as enum ('player', 'turf_owner');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Profiles are viewable by authenticated users"
  on public.profiles for select to authenticated using (true);
create policy "Users can update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Users can insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

-- User roles
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users can read own roles"
  on public.user_roles for select to authenticated using (auth.uid() = user_id);

-- Trigger: create profile + assign role from signup metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  _role public.app_role;
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  );

  _role := case
    when (new.raw_user_meta_data->>'role') = 'turf_owner' then 'turf_owner'::public.app_role
    else 'player'::public.app_role
  end;

  insert into public.user_roles (user_id, role) values (new.id, _role)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Lobby chat
create table if not exists public.match_messages (
  id uuid primary key default gen_random_uuid(),
  match_code text not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  content text not null check (length(content) between 1 and 500),
  created_at timestamptz not null default now()
);
create index match_messages_code_created_idx on public.match_messages (match_code, created_at);
alter table public.match_messages enable row level security;

create policy "Authenticated can read lobby chat"
  on public.match_messages for select to authenticated using (true);
create policy "Authenticated can post own messages"
  on public.match_messages for insert to authenticated with check (auth.uid() = sender_id);
create policy "Senders can delete own messages"
  on public.match_messages for delete to authenticated using (auth.uid() = sender_id);

alter publication supabase_realtime add table public.match_messages;