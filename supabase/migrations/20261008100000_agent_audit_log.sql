-- Audit log for the agent gateway edge function (supabase/functions/agent-gateway).
-- Every call the Muse agent makes lands here: the route, the resource it read,
-- how many rows came back, and whether it succeeded. Only the service role
-- (the function itself) writes; RLS with no policies keeps everyone else out.
create table if not exists public.agent_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  route text not null,
  resource text,
  rows int not null default 0,
  ok boolean not null default true
);

alter table public.agent_audit_log enable row level security;
