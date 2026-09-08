-- ============================================================================
-- Field forms become admin-manageable (like the visit question catalog);
-- complaints lose type/priority/due-date/department in the UI and gain a
-- detection date; competitor observations gain a VAT flag; every field record
-- gets a jsonb "extras" bag for admin-added fields; PDFs can be attached.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================

-- 1) Form field catalog ------------------------------------------------------
create table if not exists form_fields (
  id          uuid primary key default gen_random_uuid(),
  form        text not null check (form in ('sikayet','rakip','stok')),
  key         text not null check (key ~ '^[a-z0-9_]+$'),
  label_tr    text not null,
  input_type  question_input_type not null default 'text',
  options     jsonb,
  is_builtin  boolean not null default false,
  is_required boolean not null default false,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (form, key)
);
alter table form_fields enable row level security;
drop policy if exists form_fields_select on form_fields;
create policy form_fields_select on form_fields for select using (auth.uid() is not null);
drop policy if exists form_fields_admin_write on form_fields;
create policy form_fields_admin_write on form_fields for all using (is_admin()) with check (is_admin());

insert into form_fields (form, key, label_tr, input_type, options, is_builtin, is_required, sort_order) values
  ('sikayet','complainant_name','Şikayet eden kişi','text',null,true,false,10),
  ('sikayet','complainant_phone','Telefon','text',null,true,false,20),
  ('sikayet','product_category_id','Hangi ürün','select',null,true,false,30),
  ('sikayet','description','Açıklama','text',null,true,true,40),
  ('sikayet','detected_at','Tespit tarihi','date',null,true,true,50),
  ('sikayet','company','Bağlı distribütör','select',null,true,false,60),
  ('sikayet','photos','Fotoğraf','text',null,true,false,70),
  ('rakip','competitor','Rakip','select',null,true,true,10),
  ('rakip','product','Ürün','select',null,true,true,20),
  ('rakip','observed_price','Fiyat (TL)','number',null,true,false,30),
  ('rakip','price_includes_vat','KDV','select','[{"value":"dahil","label":"KDV dahil"},{"value":"haric","label":"KDV hariç"}]'::jsonb,true,false,40),
  ('rakip','city','Şehir','text',null,true,false,50),
  ('rakip','company','Nerede görüldü (firma)','select',null,true,false,60),
  ('rakip','note','Not','text',null,true,false,70),
  ('rakip','photos','Fotoğraf / fiyat listesi','text',null,true,false,80),
  ('stok','company','Bayi','select',null,true,true,10),
  ('stok','lines','Palet sayımı','number',null,true,true,20),
  ('stok','note','Not','text',null,true,false,30),
  ('stok','photos','Fotoğraf','text',null,true,false,40)
on conflict (form, key) do nothing;

-- 2) Answer columns -----------------------------------------------------------
alter table complaints              add column if not exists extras jsonb not null default '{}'::jsonb;
alter table competitor_observations add column if not exists extras jsonb not null default '{}'::jsonb;
alter table stock_counts            add column if not exists extras jsonb not null default '{}'::jsonb;
alter table complaints              add column if not exists detected_at date;
update complaints set detected_at = (created_at at time zone 'Europe/Istanbul')::date where detected_at is null;
alter table competitor_observations add column if not exists price_includes_vat boolean;

-- 3) Complaint simplification: legacy columns keep working with defaults ----
alter table complaints alter column type set default 'diger';
alter table complaints alter column owner_dept set default 'satis';
alter table complaints alter column title set default '';

-- 4) Documents: PDF files next to photos ---------------------------------------
alter table documents drop constraint if exists documents_kind_check;
alter table documents add constraint documents_kind_check check (kind in ('photo','file'));
alter table documents drop constraint if exists documents_mime_check;
alter table documents add constraint documents_mime_check
  check (mime in ('image/jpeg','image/png','image/webp','application/pdf'));

-- 5) Reporters own their records: edit and delete -------------------------------
drop policy if exists complaints_update_own_draft on complaints;
drop policy if exists complaints_update_own on complaints;
create policy complaints_update_own on complaints for update
  using (reported_by = auth.uid())
  with check (reported_by = auth.uid());
drop policy if exists complaints_delete_own on complaints;
create policy complaints_delete_own on complaints for delete
  using (reported_by = auth.uid() or is_manager());
drop policy if exists compobs_delete_own on competitor_observations;
create policy compobs_delete_own on competitor_observations for delete
  using (salesperson_id = auth.uid() or is_manager());
-- Workflow columns stay protected: a reporter update may not forge status.
create or replace function guard_complaint_reporter_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_manager() then
    new.status := old.status;
    new.assignee_id := old.assignee_id;
    new.resolved_at := old.resolved_at;
    new.reported_by := old.reported_by;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_complaints_reporter_guard on complaints;
create trigger trg_complaints_reporter_guard
  before update on complaints
  for each row execute function guard_complaint_reporter_update();
