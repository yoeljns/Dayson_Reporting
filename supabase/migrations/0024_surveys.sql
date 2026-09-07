-- ============================================================================
-- Özel raporlar (surveys): management publishes targeted questionnaires,
-- reps answer them per company (once per day unless allow_repeat).
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
create table if not exists surveys (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  status        text not null default 'taslak' check (status in ('taslak','aktif','kapandi')),
  valid_from    date,
  valid_to      date,
  target_kinds  company_kind[],     -- null = all kinds
  target_plates text[],             -- null = all plates
  target_reps   uuid[],             -- null = all reps
  allow_repeat  boolean not null default false,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create table if not exists survey_questions (
  id          uuid primary key default gen_random_uuid(),
  survey_id   uuid not null references surveys(id) on delete cascade,
  sort_order  int not null default 0,
  prompt      text not null,
  input_type  text not null check (input_type in ('boolean','select','number','text','scale')),
  options     jsonb,                -- select: [{"value","label"}]  scale: {"min","max"}
  is_required boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_survey_questions_survey on survey_questions(survey_id, sort_order);
create table if not exists survey_answers (
  id             uuid primary key default gen_random_uuid(),
  survey_id      uuid not null references surveys(id) on delete cascade,
  company_id     uuid not null references companies(id),
  visit_id       uuid references visits(id) on delete set null,
  salesperson_id uuid not null references profiles(id),
  answered_at    date not null default current_date,
  answers        jsonb not null default '{}'::jsonb,   -- {question_id: value}
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (survey_id, company_id, salesperson_id, answered_at)
);
create index if not exists idx_survey_answers_survey on survey_answers(survey_id, company_id);
create index if not exists idx_survey_answers_sp on survey_answers(salesperson_id);

alter table surveys          enable row level security;
alter table survey_questions enable row level security;
alter table survey_answers   enable row level security;

drop policy if exists surveys_manager_all on surveys;
create policy surveys_manager_all on surveys for all using (is_manager()) with check (is_manager());
drop policy if exists surveys_select_active on surveys;
create policy surveys_select_active on surveys for select
  using (status = 'aktif'
         and (valid_from is null or valid_from <= current_date)
         and (valid_to   is null or valid_to   >= current_date)
         and (target_reps is null or auth.uid() = any(target_reps)));
drop policy if exists survey_questions_manager_all on survey_questions;
create policy survey_questions_manager_all on survey_questions for all using (is_manager()) with check (is_manager());
drop policy if exists survey_questions_select on survey_questions;
create policy survey_questions_select on survey_questions for select
  using (exists (select 1 from surveys s where s.id = survey_questions.survey_id));
drop policy if exists survey_answers_manager_all on survey_answers;
create policy survey_answers_manager_all on survey_answers for all using (is_manager()) with check (is_manager());
drop policy if exists survey_answers_own on survey_answers;
create policy survey_answers_own on survey_answers for all
  using (salesperson_id = auth.uid()) with check (salesperson_id = auth.uid());
