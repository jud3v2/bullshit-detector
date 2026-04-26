drop policy if exists "Users can insert their own analysis events"
  on public.analysis_events;

revoke execute on function public.consume_analysis_quota(uuid, integer, timestamptz)
  from public, anon, authenticated;

grant execute on function public.consume_analysis_quota(uuid, integer, timestamptz)
  to service_role;
