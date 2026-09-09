-- Standalone ordinance search + RPC hardening.

create or replace function public.search_document_sections(
  p_run_id uuid,
  p_query text,
  p_limit integer default 20
) returns table(
  document_id uuid,
  source_url text,
  title text,
  ordinal integer,
  heading text,
  body text,
  rank real
)
set search_path = ''
language sql
stable
security definer
as $$
  select
    ds.document_id,
    d.source_url,
    d.title,
    ds.ordinal,
    ds.heading,
    ds.body,
    ts_rank(ds.search_vector, websearch_to_tsquery('english', p_query))::real as rank
  from public.document_sections ds
  join public.documents d on d.id = ds.document_id
  where d.research_run_id = p_run_id
    and length(trim(coalesce(p_query, ''))) > 0
    and ds.search_vector @@ websearch_to_tsquery('english', p_query)
  order by rank desc, ds.ordinal asc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on function public.upsert_parcel_geojson(uuid,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.insert_zoning_geojson(uuid,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.zoning_overlap_for_run(uuid) from public, anon, authenticated;
revoke all on function public.search_document_sections(uuid,text,integer) from public, anon, authenticated;

grant execute on function public.upsert_parcel_geojson(uuid,text,jsonb,jsonb) to service_role;
grant execute on function public.insert_zoning_geojson(uuid,text,jsonb,jsonb) to service_role;
grant execute on function public.zoning_overlap_for_run(uuid) to service_role;
grant execute on function public.search_document_sections(uuid,text,integer) to service_role;
