-- Property / Zoning Research Engine
-- Supabase PostgreSQL + PostGIS schema.

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create table if not exists public.jurisdiction_sources (
  id uuid primary key default gen_random_uuid(),
  registry_key text not null unique,
  jurisdiction jsonb not null,
  sources jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_runs (
  id uuid primary key default gen_random_uuid(),
  input_address text not null,
  matched_address text,
  status text not null check (status in ('running','completed','partial','failed')),
  packet_json jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz default now()
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid references public.research_runs(id) on delete cascade,
  kind text not null,
  url text not null,
  title text,
  host text,
  official boolean not null default false,
  confidence integer check (confidence between 0 and 100),
  confidence_reasons jsonb not null default '[]'::jsonb,
  automation_action text,
  retrieved_at timestamptz,
  source_modified_at timestamptz,
  raw_metadata jsonb,
  unique (research_run_id, kind, url)
);

create table if not exists public.parcels (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  source_url text,
  properties jsonb not null default '{}'::jsonb,
  geom extensions.geometry(Geometry,4326),
  raw_geojson jsonb,
  created_at timestamptz not null default now()
);
create index if not exists parcels_geom_gix on public.parcels using gist (geom);
create index if not exists parcels_run_idx on public.parcels(research_run_id);

create table if not exists public.zoning_intersections (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  source_url text,
  properties jsonb not null default '{}'::jsonb,
  geom extensions.geometry(Geometry,4326),
  raw_geojson jsonb,
  created_at timestamptz not null default now()
);
create index if not exists zoning_geom_gix on public.zoning_intersections using gist (geom);
create index if not exists zoning_run_idx on public.zoning_intersections(research_run_id);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid references public.research_runs(id) on delete cascade,
  source_url text not null,
  title text,
  content_type text,
  byte_count bigint,
  sha256 text,
  retrieved_at timestamptz,
  source_modified_at timestamptz,
  policy jsonb,
  raw_metadata jsonb,
  unique (research_run_id, source_url)
);

create table if not exists public.document_sections (
  id bigserial primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  ordinal integer not null,
  heading text,
  body text not null,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(heading,'') || ' ' || body)) stored,
  unique(document_id, ordinal)
);
create index if not exists document_sections_search_gin on public.document_sections using gin(search_vector);

alter table public.jurisdiction_sources enable row level security;
alter table public.research_runs enable row level security;
alter table public.sources enable row level security;
alter table public.parcels enable row level security;
alter table public.zoning_intersections enable row level security;
alter table public.documents enable row level security;
alter table public.document_sections enable row level security;

create or replace function public.upsert_parcel_geojson(
  p_run_id uuid,
  p_source_url text,
  p_properties jsonb,
  p_geojson jsonb
) returns uuid
set search_path = ''
language plpgsql
security definer
as $$
declare v_id uuid;
begin
  insert into public.parcels(research_run_id, source_url, properties, geom, raw_geojson)
  values (
    p_run_id,
    p_source_url,
    coalesce(p_properties, '{}'::jsonb),
    case when p_geojson is null then null else extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(p_geojson::text),4326) end,
    p_geojson
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.insert_zoning_geojson(
  p_run_id uuid,
  p_source_url text,
  p_properties jsonb,
  p_geojson jsonb
) returns uuid
set search_path = ''
language plpgsql
security definer
as $$
declare v_id uuid;
begin
  insert into public.zoning_intersections(research_run_id, source_url, properties, geom, raw_geojson)
  values (
    p_run_id,
    p_source_url,
    coalesce(p_properties, '{}'::jsonb),
    case when p_geojson is null then null else extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(p_geojson::text),4326) end,
    p_geojson
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.zoning_overlap_for_run(p_run_id uuid)
returns table(
  zoning_id uuid,
  source_url text,
  properties jsonb,
  overlap_area_m2 double precision,
  parcel_area_m2 double precision,
  overlap_percent double precision
)
set search_path = ''
language sql
stable
as $$
  with p as (
    select geom from public.parcels where research_run_id = p_run_id and geom is not null order by created_at limit 1
  )
  select z.id,
         z.source_url,
         z.properties,
         extensions.ST_Area(extensions.ST_Intersection(z.geom, p.geom)::extensions.geography) as overlap_area_m2,
         extensions.ST_Area(p.geom::extensions.geography) as parcel_area_m2,
         case when extensions.ST_Area(p.geom::extensions.geography) = 0 then null
              else 100.0 * extensions.ST_Area(extensions.ST_Intersection(z.geom, p.geom)::extensions.geography)
                   / extensions.ST_Area(p.geom::extensions.geography)
         end as overlap_percent
  from public.zoning_intersections z cross join p
  where z.research_run_id = p_run_id and z.geom is not null and extensions.ST_Intersects(z.geom, p.geom)
  order by overlap_percent desc nulls last;
$$;
