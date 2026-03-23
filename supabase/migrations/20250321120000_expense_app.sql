-- Expense sample app: per-user catalog items and expense rows (browser client + RLS).
-- Apply: Supabase CLI `supabase db push` or paste into SQL Editor in the dashboard.
--
-- After migrate: Authentication → Providers → enable Email.
-- For quick testing, disable "Confirm email" under Auth → Providers → Email.

create table if not exists public.expense_catalog_items (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint expense_catalog_items_pkey primary key (id)
);

create index if not exists expense_catalog_items_user_id_idx on public.expense_catalog_items (user_id);

create table if not exists public.expense_entries (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text,
  item_id text not null,
  item_name text,
  price numeric,
  quantity numeric,
  expense_date date,
  cuotas integer,
  referencia text,
  created_at timestamptz not null default now(),
  constraint expense_entries_pkey primary key (id)
);

create index if not exists expense_entries_user_id_idx on public.expense_entries (user_id);
create index if not exists expense_entries_created_at_idx on public.expense_entries (user_id, created_at desc);

alter table public.expense_catalog_items enable row level security;
alter table public.expense_entries enable row level security;

create policy "expense_catalog_items_select_own"
  on public.expense_catalog_items for select
  to authenticated
  using (auth.uid() = user_id);

create policy "expense_catalog_items_insert_own"
  on public.expense_catalog_items for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "expense_catalog_items_update_own"
  on public.expense_catalog_items for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "expense_catalog_items_delete_own"
  on public.expense_catalog_items for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "expense_entries_select_own"
  on public.expense_entries for select
  to authenticated
  using (auth.uid() = user_id);

create policy "expense_entries_insert_own"
  on public.expense_entries for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "expense_entries_update_own"
  on public.expense_entries for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "expense_entries_delete_own"
  on public.expense_entries for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.expense_catalog_items to authenticated;
grant select, insert, update, delete on public.expense_entries to authenticated;
