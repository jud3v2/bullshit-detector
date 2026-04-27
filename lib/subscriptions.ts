import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

export type SubscriptionPlanId = 'free' | 'starter' | 'plus' | 'pro';

export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  name: string;
  priceEur: number;
  aiBudgetCentsWeekly: number;
  monthlyAnalyses: number;
  weeklyAnalyses: number;
  hourlyAnalyses: number;
  features: string[];
  iosProductId?: string;
  androidProductId?: string;
};

export type SubscriptionState = {
  planId: SubscriptionPlanId;
  nativeStatus: 'inactive' | 'trial' | 'active' | 'grace' | 'expired';
  productId?: string;
  currentPeriodEndsAt?: string;
  updatedAt: string;
};

export type UsageWindow = {
  windowStartedAt: string;
  usedAnalyses: number;
  usedBudgetCents: number;
};

export type UsageState = {
  month: UsageWindow;
  week: UsageWindow;
  hour: UsageWindow;
};

export type LimitCheck = {
  allowed: boolean;
  plan: SubscriptionPlan;
  usage: UsageState;
  reason?: 'subscription_required' | 'monthly_analysis_limit' | 'weekly_analysis_limit' | 'weekly_budget_limit' | 'hourly_limit';
  remainingMonthlyAnalyses: number;
  remainingWeeklyAnalyses: number;
  remainingHourlyAnalyses: number;
  remainingBudgetCents: number;
  nextMonthlyResetAt: string;
  nextWeeklyResetAt: string;
  nextHourlyResetAt: string;
};

export const SUBSCRIPTION_KEY = 'bullshit-detector.subscription.v1';
export const USAGE_KEY = 'bullshit-detector.usage.v1';
export const AI_ANALYSIS_COST_CENTS = 8;

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    priceEur: 0,
    aiBudgetCentsWeekly: 0,
    monthlyAnalyses: 3,
    weeklyAnalyses: 3,
    hourlyAnalyses: 3,
    features: ['3 AI analyses per month', 'Local heuristic analysis', 'Public URL metadata', 'Manual paste'],
  },
  {
    id: 'starter',
    name: 'Starter',
    priceEur: 2.99,
    aiBudgetCentsWeekly: 100,
    monthlyAnalyses: 320,
    weeklyAnalyses: 80,
    hourlyAnalyses: 12,
    features: ['AI post summaries', 'Scam detection', 'Weekly reset', 'Hourly surge protection'],
    iosProductId: 'bullshit_detector_starter_monthly',
    androidProductId: 'bullshit_detector_starter_monthly',
  },
  {
    id: 'plus',
    name: 'Plus',
    priceEur: 4.99,
    aiBudgetCentsWeekly: 250,
    monthlyAnalyses: 880,
    weeklyAnalyses: 220,
    hourlyAnalyses: 30,
    features: ['More weekly credits', 'More social enrichment', 'Priority analysis window', 'Better summaries'],
    iosProductId: 'bullshit_detector_plus_monthly',
    androidProductId: 'bullshit_detector_plus_monthly',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceEur: 20,
    aiBudgetCentsWeekly: 2000,
    monthlyAnalyses: 6400,
    weeklyAnalyses: 1600,
    hourlyAnalyses: 120,
    features: ['20x Starter credits', 'High-volume protection', 'Pro scam checks', 'Priority reset windows'],
    iosProductId: 'bullshit_detector_pro_monthly',
    androidProductId: 'bullshit_detector_pro_monthly',
  },
];

function getPreviewPlanOverride(): SubscriptionPlanId | null {
  const previewPlan = Constants.expoConfig?.extra?.previewSubscriptionPlan;

  if (previewPlan === 'starter' || previewPlan === 'plus' || previewPlan === 'pro') {
    return previewPlan;
  }

  return null;
}

export function buildPreviewSubscriptionState(planId: SubscriptionPlanId): SubscriptionState {
  const plan = getPlan(planId);

  return {
    planId,
    nativeStatus: planId === 'free' ? 'inactive' : 'active',
    productId: plan.iosProductId ?? plan.androidProductId,
    currentPeriodEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function getPlan(planId: SubscriptionPlanId) {
  return subscriptionPlans.find((plan) => plan.id === planId) ?? subscriptionPlans[0];
}

export async function readSubscriptionState(): Promise<SubscriptionState> {
  const previewOverride = getPreviewPlanOverride();

  if (previewOverride) {
    return buildPreviewSubscriptionState(previewOverride);
  }

  try {
    const value = await SecureStore.getItemAsync(SUBSCRIPTION_KEY);

    if (!value) {
      return {
        planId: 'free',
        nativeStatus: 'inactive',
        updatedAt: new Date().toISOString(),
      };
    }

    return JSON.parse(value) as SubscriptionState;
  } catch (error) {
    console.log('[BullshitDetector] Subscription read failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      planId: 'free',
      nativeStatus: 'inactive',
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function writeSubscriptionState(state: SubscriptionState) {
  try {
    await SecureStore.setItemAsync(SUBSCRIPTION_KEY, JSON.stringify(state));
  } catch (error) {
    console.log('[BullshitDetector] Subscription write failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function readUsageState(): Promise<UsageState> {
  const now = new Date().toISOString();
  const fallback = {
    month: { windowStartedAt: now, usedAnalyses: 0, usedBudgetCents: 0 },
    week: { windowStartedAt: now, usedAnalyses: 0, usedBudgetCents: 0 },
    hour: { windowStartedAt: now, usedAnalyses: 0, usedBudgetCents: 0 },
  };

  try {
    const value = await SecureStore.getItemAsync(USAGE_KEY);
    const usage = value ? (JSON.parse(value) as UsageState) : fallback;

    return resetExpiredWindows(usage);
  } catch (error) {
    console.log('[BullshitDetector] Usage read failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    return fallback;
  }
}

export async function writeUsageState(usage: UsageState) {
  try {
    await SecureStore.setItemAsync(USAGE_KEY, JSON.stringify(usage));
  } catch (error) {
    console.log('[BullshitDetector] Usage write failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function checkAiAllowance(costCents = AI_ANALYSIS_COST_CENTS): Promise<LimitCheck> {
  const subscription = await readSubscriptionState();
  const plan = getPlan(subscription.planId);
  const usage = await readUsageState();
  const remainingMonthlyAnalyses = Math.max(plan.monthlyAnalyses - usage.month.usedAnalyses, 0);
  const remainingWeeklyAnalyses = Math.max(plan.weeklyAnalyses - usage.week.usedAnalyses, 0);
  const remainingHourlyAnalyses = Math.max(plan.hourlyAnalyses - usage.hour.usedAnalyses, 0);
  const remainingBudgetCents = Math.max(plan.aiBudgetCentsWeekly - usage.week.usedBudgetCents, 0);

  if (plan.id === 'free') {
    if (remainingMonthlyAnalyses <= 0) {
      return buildLimitCheck(false, plan, usage, 'subscription_required', remainingMonthlyAnalyses, remainingWeeklyAnalyses, remainingHourlyAnalyses, remainingBudgetCents);
    }

    if (remainingHourlyAnalyses <= 0) {
      return buildLimitCheck(false, plan, usage, 'hourly_limit', remainingMonthlyAnalyses, remainingWeeklyAnalyses, remainingHourlyAnalyses, remainingBudgetCents);
    }

    return buildLimitCheck(true, plan, usage, undefined, remainingMonthlyAnalyses, remainingWeeklyAnalyses, remainingHourlyAnalyses, remainingBudgetCents);
  }

  if (remainingHourlyAnalyses <= 0) {
    return buildLimitCheck(false, plan, usage, 'hourly_limit', remainingMonthlyAnalyses, remainingWeeklyAnalyses, remainingHourlyAnalyses, remainingBudgetCents);
  }

  if (remainingWeeklyAnalyses <= 0) {
    return buildLimitCheck(false, plan, usage, 'weekly_analysis_limit', remainingMonthlyAnalyses, remainingWeeklyAnalyses, remainingHourlyAnalyses, remainingBudgetCents);
  }

  if (remainingBudgetCents < costCents) {
    return buildLimitCheck(false, plan, usage, 'weekly_budget_limit', remainingMonthlyAnalyses, remainingWeeklyAnalyses, remainingHourlyAnalyses, remainingBudgetCents);
  }

  return buildLimitCheck(true, plan, usage, undefined, remainingMonthlyAnalyses, remainingWeeklyAnalyses, remainingHourlyAnalyses, remainingBudgetCents);
}

export async function consumeAiAllowance(costCents = AI_ANALYSIS_COST_CENTS) {
  const check = await checkAiAllowance(costCents);

  if (!check.allowed) {
    return check;
  }

  const nextUsage: UsageState = {
    month: {
      ...check.usage.month,
      usedAnalyses: check.usage.month.usedAnalyses + 1,
      usedBudgetCents: check.usage.month.usedBudgetCents + costCents,
    },
    week: {
      ...check.usage.week,
      usedAnalyses: check.usage.week.usedAnalyses + 1,
      usedBudgetCents: check.usage.week.usedBudgetCents + costCents,
    },
    hour: {
      ...check.usage.hour,
      usedAnalyses: check.usage.hour.usedAnalyses + 1,
      usedBudgetCents: check.usage.hour.usedBudgetCents + costCents,
    },
  };

  await writeUsageState(nextUsage);

  return checkAiAllowance(costCents);
}

export function nextResetAt(startedAt: string, windowMs: number) {
  return new Date(new Date(startedAt).getTime() + windowMs).toISOString();
}

function resetExpiredWindows(usage: UsageState): UsageState {
  const now = Date.now();
  const monthMs = 30 * 24 * 60 * 60 * 1000;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const nextUsage = {
    ...usage,
    month: usage.month ?? { windowStartedAt: new Date().toISOString(), usedAnalyses: 0, usedBudgetCents: 0 },
  };

  if (now - new Date(nextUsage.month.windowStartedAt).getTime() >= monthMs) {
    nextUsage.month = { windowStartedAt: new Date().toISOString(), usedAnalyses: 0, usedBudgetCents: 0 };
  }

  if (now - new Date(usage.week.windowStartedAt).getTime() >= weekMs) {
    nextUsage.week = { windowStartedAt: new Date().toISOString(), usedAnalyses: 0, usedBudgetCents: 0 };
  }

  if (now - new Date(usage.hour.windowStartedAt).getTime() >= hourMs) {
    nextUsage.hour = { windowStartedAt: new Date().toISOString(), usedAnalyses: 0, usedBudgetCents: 0 };
  }

  return nextUsage;
}

function buildLimitCheck(
  allowed: boolean,
  plan: SubscriptionPlan,
  usage: UsageState,
  reason: LimitCheck['reason'],
  remainingMonthlyAnalyses: number,
  remainingWeeklyAnalyses: number,
  remainingHourlyAnalyses: number,
  remainingBudgetCents: number,
): LimitCheck {
  return {
    allowed,
    plan,
    usage,
    reason,
    remainingMonthlyAnalyses,
    remainingWeeklyAnalyses,
    remainingHourlyAnalyses,
    remainingBudgetCents,
    nextMonthlyResetAt: nextResetAt(usage.month.windowStartedAt, 30 * 24 * 60 * 60 * 1000),
    nextWeeklyResetAt: nextResetAt(usage.week.windowStartedAt, 7 * 24 * 60 * 60 * 1000),
    nextHourlyResetAt: nextResetAt(usage.hour.windowStartedAt, 60 * 60 * 1000),
  };
}
