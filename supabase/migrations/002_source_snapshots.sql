-- Preserve immutable raw-source snapshots for auditability and re-processing.
create table if not exists public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  kind text not null,
  url text not null,
  content_type text,
  retrieved_at timestamptz not null default now(),
  source_modified_at timestamptz,
  sha256 text,
  payload_json jsonb,
  body_text text,
  byte_count bigint,
  created_at timestamptz not null default now()
);
create index if not exists source_snapshots_run_idx on public.source_snapshots(research_run_id);
create index if not exists source_snapshots_kind_idx on public.source_snapshots(kind);
alter table public.source_snapshots enable row level security;
