-- Bullshit Detector - Supabase foundation schema
-- Run in the Supabase SQL editor after creating the project.
-- Service-role writes should happen from Edge Functions or a backend, never from the mobile app.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'fr')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_products (
  id text primary key,
  name text not null,
  description text,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  weekly_ai_budget_cents integer not null default 0 check (weekly_ai_budget_cents >= 0),
  hourly_request_limit integer not null default 0 check (hourly_request_limit >= 0),
  weekly_request_limit integer not null default 0 check (weekly_request_limit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.subscription_products(id),
  provider text not null check (provider in ('apple', 'google', 'stripe', 'manual')),
  status text not null check (status in ('trialing', 'active', 'grace_period', 'past_due', 'paused', 'canceled', 'expired')),
  store_product_id text,
  store_original_transaction_id text,
  store_purchase_token text,
  stripe_customer_id text,
  stripe_subscription_id text,
  environment text not null default 'production' check (environment in ('sandbox', 'production')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  raw_event jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_subscriptions_user_status_idx
  on public.user_subscriptions(user_id, status, current_period_end desc);

create table if not exists public.entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  source_subscription_id uuid references public.user_subscriptions(id) on delete set null,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.usage_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  window_type text not null check (window_type in ('hour', 'week')),
  window_started_at timestamptz not null,
  analysis_count integer not null default 0 check (analysis_count >= 0),
  ai_budget_cents_used integer not null default 0 check (ai_budget_cents_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, window_type, window_started_at)
);

create table if not exists public.analysis_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('normal', 'ai')),
  platform text,
  input_kind text not null default 'text' check (input_kind in ('text', 'url', 'share')),
  score integer check (score between 0 and 100),
  risk_level text check (risk_level in ('faible', 'moyen', 'eleve', 'low', 'medium', 'high')),
  credits_used integer not null default 0 check (credits_used >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analysis_events_user_created_idx
  on public.analysis_events(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.subscription_products enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.entitlements enable row level security;
alter table public.usage_windows enable row level security;
alter table public.analysis_events enable row level security;

create policy "Users can read their profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "Users can update their profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Authenticated users can read active products"
  on public.subscription_products for select
  to authenticated
  using (is_active = true);

create policy "Users can read their subscriptions"
  on public.user_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can read their entitlements"
  on public.entitlements for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can read their usage windows"
  on public.usage_windows for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can read their analysis events"
  on public.analysis_events for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert their own analysis events"
  on public.analysis_events for insert
  to authenticated
  with check (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.subscription_products (
  id,
  name,
  description,
  monthly_price_cents,
  weekly_ai_budget_cents,
  hourly_request_limit,
  weekly_request_limit
) values
  ('free', 'Free', 'Manual analysis with basic limits.', 0, 0, 8, 35),
  ('plus', 'Plus', 'Premium AI analysis with controlled weekly credits.', 299, 100, 12, 80),
  ('max', 'Max', 'More AI credits and richer analysis history.', 499, 240, 24, 180),
  ('pro', 'Pro', 'High-limit professional usage.', 2000, 2000, 120, 1200)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  weekly_ai_budget_cents = excluded.weekly_ai_budget_cents,
  hourly_request_limit = excluded.hourly_request_limit,
  weekly_request_limit = excluded.weekly_request_limit,
  is_active = true;
