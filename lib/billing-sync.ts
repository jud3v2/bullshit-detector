import {
  readSubscriptionState,
  readUsageState,
  buildPreviewSubscriptionState,
  writeSubscriptionState,
  writeUsageState,
  type SubscriptionPlanId,
  type SubscriptionState,
  type UsageState,
} from './subscriptions';
import { isSupabaseConfigured, supabase } from './supabase';

type UsageWindowRow = {
  window_type: 'month' | 'week' | 'hour';
  window_started_at: string;
  analysis_count: number;
  ai_budget_cents_used: number;
};

type SubscriptionRow = {
  product_id: SubscriptionPlanId;
  status: 'trialing' | 'active' | 'grace_period' | 'past_due' | 'paused' | 'canceled' | 'expired';
  current_period_end: string | null;
};

export async function syncBillingFromSupabase() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return null;
  }

  const [subscriptionResult, usageResult] = await Promise.all([
    supabase
      .from('user_subscriptions')
      .select('product_id,status,current_period_end')
      .eq('user_id', session.user.id)
      .in('status', ['trialing', 'active', 'grace_period'])
      .order('current_period_end', { ascending: false, nullsFirst: true })
      .limit(1)
      .maybeSingle<SubscriptionRow>(),
    supabase
      .from('usage_windows')
      .select('window_type,window_started_at,analysis_count,ai_budget_cents_used')
      .eq('user_id', session.user.id)
      .order('window_started_at', { ascending: false })
      .limit(12)
      .returns<UsageWindowRow[]>(),
  ]);

  if (subscriptionResult.error) {
    console.log('[BullshitDetector] Remote subscription sync failed', {
      message: subscriptionResult.error.message,
    });
  }

  if (usageResult.error) {
    console.log('[BullshitDetector] Remote usage sync failed', {
      message: usageResult.error.message,
    });
  }

  const localSubscription = await readSubscriptionState();
  const localUsage = await readUsageState();
  const remoteSubscription = subscriptionResult.data;
  const nextSubscription: SubscriptionState = remoteSubscription
    ? {
        planId: remoteSubscription.product_id,
        nativeStatus:
          remoteSubscription.status === 'trialing'
            ? 'trial'
            : remoteSubscription.status === 'grace_period'
              ? 'grace'
              : remoteSubscription.status === 'active'
                ? 'active'
                : 'expired',
        currentPeriodEndsAt: remoteSubscription.current_period_end ?? undefined,
        updatedAt: new Date().toISOString(),
      }
    : localSubscription.planId === 'free'
      ? buildPreviewSubscriptionState('free')
      : localSubscription;
  const nextUsage = mapUsageRowsToState(usageResult.data ?? [], localUsage);

  await Promise.all([writeSubscriptionState(nextSubscription), writeUsageState(nextUsage)]);

  return {
    subscription: nextSubscription,
    usage: nextUsage,
  };
}

function mapUsageRowsToState(rows: UsageWindowRow[], fallback: UsageState): UsageState {
  const month = rows.find((row) => row.window_type === 'month');
  const week = rows.find((row) => row.window_type === 'week');
  const hour = rows.find((row) => row.window_type === 'hour');

  return {
    month: month
      ? {
          windowStartedAt: month.window_started_at,
          usedAnalyses: month.analysis_count,
          usedBudgetCents: month.ai_budget_cents_used,
        }
      : fallback.month,
    week: week
      ? {
          windowStartedAt: week.window_started_at,
          usedAnalyses: week.analysis_count,
          usedBudgetCents: week.ai_budget_cents_used,
        }
      : fallback.week,
    hour: hour
      ? {
          windowStartedAt: hour.window_started_at,
          usedAnalyses: hour.analysis_count,
          usedBudgetCents: hour.ai_budget_cents_used,
        }
      : fallback.hour,
  };
}
