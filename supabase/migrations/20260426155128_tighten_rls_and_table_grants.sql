revoke all on table public.profiles from anon;
revoke all on table public.subscription_products from anon;
revoke all on table public.user_subscriptions from anon;
revoke all on table public.entitlements from anon;
revoke all on table public.usage_windows from anon;
revoke all on table public.analysis_events from anon;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.subscription_products to authenticated;
grant select on table public.user_subscriptions to authenticated;
grant select on table public.entitlements to authenticated;
grant select on table public.usage_windows to authenticated;
grant select on table public.analysis_events to authenticated;

create index if not exists entitlements_source_subscription_id_idx
  on public.entitlements(source_subscription_id)
  where source_subscription_id is not null;

create index if not exists user_subscriptions_product_id_idx
  on public.user_subscriptions(product_id);

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Users can insert their profile" on public.profiles;
create policy "Users can insert their profile"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "Users can read their subscriptions" on public.user_subscriptions;
create policy "Users can read their subscriptions"
  on public.user_subscriptions for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can read their entitlements" on public.entitlements;
create policy "Users can read their entitlements"
  on public.entitlements for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can read their usage windows" on public.usage_windows;
create policy "Users can read their usage windows"
  on public.usage_windows for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can read their analysis events" on public.analysis_events;
create policy "Users can read their analysis events"
  on public.analysis_events for select
  to authenticated
  using (user_id = (select auth.uid()));
