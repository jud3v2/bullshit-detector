import { router } from 'expo-router';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export async function redirectToLoginIfNeeded() {
  if (!isSupabaseConfigured()) {
    router.replace('/');
    return;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    router.replace('/');
  }
}
