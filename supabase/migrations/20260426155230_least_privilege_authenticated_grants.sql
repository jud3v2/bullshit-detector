revoke all on table public.profiles from authenticated;
revoke all on table public.subscription_products from authenticated;
revoke all on table public.user_subscriptions from authenticated;
revoke all on table public.entitlements from authenticated;
revoke all on table public.usage_windows from authenticated;
revoke all on table public.analysis_events from authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.subscription_products to authenticated;
grant select on table public.user_subscriptions to authenticated;
grant select on table public.entitlements to authenticated;
grant select on table public.usage_windows to authenticated;
grant select on table public.analysis_events to authenticated;
