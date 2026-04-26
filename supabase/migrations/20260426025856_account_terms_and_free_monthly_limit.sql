alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'blocked', 'deleted'));

alter table public.subscription_products
  add column if not exists monthly_request_limit integer not null default 0
    check (monthly_request_limit >= 0);

alter table public.usage_windows
  drop constraint if exists usage_windows_window_type_check;

alter table public.usage_windows
  add constraint usage_windows_window_type_check
  check (window_type in ('hour', 'week', 'month'));

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can insert their profile'
  ) then
    create policy "Users can insert their profile"
      on public.profiles for insert
      to authenticated
      with check (id = auth.uid());
  end if;
end;
$$;

update public.subscription_products
set
  description = 'Manual analysis plus 3 AI analyses per month.',
  monthly_request_limit = 3,
  weekly_request_limit = 3,
  hourly_request_limit = 3,
  weekly_ai_budget_cents = 0
where id = 'free';

insert into public.subscription_products (
  id,
  name,
  description,
  monthly_price_cents,
  weekly_ai_budget_cents,
  hourly_request_limit,
  weekly_request_limit,
  monthly_request_limit
) values (
  'starter',
  'Starter',
  'Premium AI analysis with controlled weekly credits.',
  299,
  100,
  12,
  80,
  320
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  weekly_ai_budget_cents = excluded.weekly_ai_budget_cents,
  hourly_request_limit = excluded.hourly_request_limit,
  weekly_request_limit = excluded.weekly_request_limit,
  monthly_request_limit = excluded.monthly_request_limit,
  is_active = true;

update public.subscription_products
set
  name = 'Plus',
  description = 'More AI credits and richer analysis history.',
  monthly_price_cents = 499,
  weekly_ai_budget_cents = 250,
  monthly_request_limit = 880,
  weekly_request_limit = 220,
  hourly_request_limit = 30,
  is_active = true
where id = 'plus';

update public.subscription_products
set is_active = false
where id = 'max';

update public.subscription_products
set monthly_request_limit = 6400
where id = 'pro' and monthly_request_limit = 0;
