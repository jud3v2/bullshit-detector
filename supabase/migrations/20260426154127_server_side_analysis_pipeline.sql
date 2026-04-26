alter table public.analysis_events
  add column if not exists verdict text check (verdict in ('fiable', 'incertain', 'bullshit')),
  add column if not exists confidence numeric check (confidence >= 0 and confidence <= 1),
  add column if not exists requires_external_check boolean,
  add column if not exists source_url text,
  add column if not exists input_hash text,
  add column if not exists input_preview text,
  add column if not exists user_question text,
  add column if not exists ai_model text,
  add column if not exists latency_ms integer check (latency_ms is null or latency_ms >= 0),
  add column if not exists function_version text;

create index if not exists analysis_events_user_mode_created_idx
  on public.analysis_events(user_id, mode, created_at desc);

create index if not exists analysis_events_user_platform_created_idx
  on public.analysis_events(user_id, platform, created_at desc)
  where platform is not null;

create index if not exists analysis_events_user_input_hash_idx
  on public.analysis_events(user_id, input_hash)
  where input_hash is not null;

create index if not exists usage_windows_user_type_started_idx
  on public.usage_windows(user_id, window_type, window_started_at desc);

create index if not exists user_subscriptions_active_user_period_idx
  on public.user_subscriptions(user_id, current_period_end desc)
  where status in ('trialing', 'active', 'grace_period');

create or replace function public.consume_analysis_quota(
  p_user_id uuid,
  p_cost_cents integer default 8,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan public.subscription_products%rowtype;
  v_month_start timestamptz := date_trunc('month', p_now);
  v_week_start timestamptz := date_trunc('week', p_now);
  v_hour_start timestamptz := date_trunc('hour', p_now);
  v_month_count integer := 0;
  v_week_count integer := 0;
  v_hour_count integer := 0;
  v_week_budget integer := 0;
  v_reason text;
begin
  if p_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'user_required');
  end if;

  select sp.*
  into v_plan
  from public.user_subscriptions us
  join public.subscription_products sp on sp.id = us.product_id
  where us.user_id = p_user_id
    and sp.is_active = true
    and us.status in ('trialing', 'active', 'grace_period')
    and (us.current_period_end is null or us.current_period_end > p_now)
  order by
    case us.status
      when 'active' then 1
      when 'trialing' then 2
      when 'grace_period' then 3
      else 4
    end,
    us.current_period_end desc nulls first
  limit 1;

  if not found then
    select *
    into v_plan
    from public.subscription_products
    where id = 'free'
    limit 1;
  end if;

  if v_plan.id is null then
    return jsonb_build_object('allowed', false, 'reason', 'plan_not_found');
  end if;

  insert into public.usage_windows (user_id, window_type, window_started_at)
  values
    (p_user_id, 'month', v_month_start),
    (p_user_id, 'week', v_week_start),
    (p_user_id, 'hour', v_hour_start)
  on conflict (user_id, window_type, window_started_at) do nothing;

  with locked_windows as (
    select *
    from public.usage_windows
    where user_id = p_user_id
      and (
        (window_type = 'month' and window_started_at = v_month_start)
        or (window_type = 'week' and window_started_at = v_week_start)
        or (window_type = 'hour' and window_started_at = v_hour_start)
      )
    for update
  )
  select
    coalesce(max(analysis_count) filter (where window_type = 'month'), 0),
    coalesce(max(analysis_count) filter (where window_type = 'week'), 0),
    coalesce(max(analysis_count) filter (where window_type = 'hour'), 0),
    coalesce(max(ai_budget_cents_used) filter (where window_type = 'week'), 0)
  into v_month_count, v_week_count, v_hour_count, v_week_budget
  from locked_windows;

  if v_plan.monthly_request_limit > 0 and v_month_count >= v_plan.monthly_request_limit then
    v_reason := case when v_plan.id = 'free' then 'subscription_required' else 'monthly_analysis_limit' end;
  elsif v_plan.weekly_request_limit > 0 and v_week_count >= v_plan.weekly_request_limit then
    v_reason := 'weekly_analysis_limit';
  elsif v_plan.hourly_request_limit > 0 and v_hour_count >= v_plan.hourly_request_limit then
    v_reason := 'hourly_limit';
  elsif v_plan.weekly_ai_budget_cents > 0 and (v_week_budget + p_cost_cents) > v_plan.weekly_ai_budget_cents then
    v_reason := 'weekly_budget_limit';
  end if;

  if v_reason is not null then
    return jsonb_build_object(
      'allowed', false,
      'reason', v_reason,
      'plan', jsonb_build_object(
        'id', v_plan.id,
        'name', v_plan.name,
        'monthly_request_limit', v_plan.monthly_request_limit,
        'weekly_request_limit', v_plan.weekly_request_limit,
        'hourly_request_limit', v_plan.hourly_request_limit,
        'weekly_ai_budget_cents', v_plan.weekly_ai_budget_cents
      ),
      'usage', jsonb_build_object(
        'month', jsonb_build_object('used_analyses', v_month_count, 'window_started_at', v_month_start, 'reset_at', v_month_start + interval '1 month'),
        'week', jsonb_build_object('used_analyses', v_week_count, 'used_budget_cents', v_week_budget, 'window_started_at', v_week_start, 'reset_at', v_week_start + interval '1 week'),
        'hour', jsonb_build_object('used_analyses', v_hour_count, 'window_started_at', v_hour_start, 'reset_at', v_hour_start + interval '1 hour')
      )
    );
  end if;

  update public.usage_windows
  set
    analysis_count = analysis_count + 1,
    ai_budget_cents_used = ai_budget_cents_used + case when window_type = 'week' then p_cost_cents else 0 end,
    updated_at = p_now
  where user_id = p_user_id
    and (
      (window_type = 'month' and window_started_at = v_month_start)
      or (window_type = 'week' and window_started_at = v_week_start)
      or (window_type = 'hour' and window_started_at = v_hour_start)
    );

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'name', v_plan.name,
      'monthly_request_limit', v_plan.monthly_request_limit,
      'weekly_request_limit', v_plan.weekly_request_limit,
      'hourly_request_limit', v_plan.hourly_request_limit,
      'weekly_ai_budget_cents', v_plan.weekly_ai_budget_cents
    ),
    'usage', jsonb_build_object(
      'month', jsonb_build_object('used_analyses', v_month_count + 1, 'window_started_at', v_month_start, 'reset_at', v_month_start + interval '1 month'),
      'week', jsonb_build_object('used_analyses', v_week_count + 1, 'used_budget_cents', v_week_budget + p_cost_cents, 'window_started_at', v_week_start, 'reset_at', v_week_start + interval '1 week'),
      'hour', jsonb_build_object('used_analyses', v_hour_count + 1, 'window_started_at', v_hour_start, 'reset_at', v_hour_start + interval '1 hour')
    )
  );
end;
$$;
