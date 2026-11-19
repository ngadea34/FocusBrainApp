-- ============================================================================
-- 0007 — Moteur documentaire V1 : métadonnées obligatoires et licences
-- (brief « Research Engine V1 », §3 et §5). Chaque source garde sa provenance,
-- ses identifiants, sa licence normalisée et son niveau de preuve.
-- ============================================================================
alter table public.sources
  add column source_provider    text,
  add column providers          text[] not null default '{}',
  add column publication_date   text check (publication_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  add column pmid               text,
  add column pmcid              text,
  add column hal_id             text,
  add column wikidata_id        text,
  add column abstract           text,
  add column document_type      text,
  add column language           text,
  add column license_raw        text,
  add column license_code       text not null default 'unknown',
  add column license_allows_generation boolean not null default false,
  add column peer_review_status text not null default 'unknown'
    check (peer_review_status in ('peer_reviewed', 'not_peer_reviewed', 'unknown')),
  add column publication_status text not null default 'unknown'
    check (publication_status in ('published', 'preprint', 'thesis', 'retracted', 'unknown')),
  add column evidence_level     text not null default 'unknown'
    check (evidence_level in ('institutional_guideline', 'systematic_review', 'peer_reviewed_study', 'primary_study',
                              'preprint', 'educational', 'encyclopedic', 'unknown')),
  add column reliability_tier   smallint not null default 6 check (reliability_tier between 1 and 6),
  add column citation           text;

comment on column public.sources.license_allows_generation is
  'true seulement si la licence permet usage commercial ET transformation : seul ce texte peut être transmis au modèle';
comment on column public.sources.abstract is
  'Résumé ou extrait, conservé pour la traçabilité ; transmis au modèle seulement si license_allows_generation';

create index sources_pmid_idx on public.sources(pmid) where pmid is not null;
create index sources_doi_idx  on public.sources(doi)  where doi  is not null;

-- Lecture : couverte par le GRANT SELECT existant sur la table (la RLS filtre les lignes par épisode).
