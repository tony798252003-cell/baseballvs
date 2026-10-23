-- Roster fields, app_settings, and RLS. Re-runnable.

alter table players add column if not exists org text not null default 'CPBL';
alter table players add column if not exists status text not null default 'active';
alter table players add column if not exists roster_mark text;
alter table players add column if not exists npb_id text unique;
alter table players add column if not exists mlb_id integer unique;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.players'::regclass and conname = 'players_status_check'
  ) then
    alter table players
      add constraint players_status_check check (status in ('active','departed'));
  end if;
end $$;

-- cpbl_acnt already has a unique constraint; add a partial unique index only if no unique one exists.
do $$
begin
  if not exists (
    select 1 from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = 'public.players'::regclass
      and i.indisunique and i.indnatts = 1 and a.attname = 'cpbl_acnt'
  ) then
    create unique index players_cpbl_acnt_key on players (cpbl_acnt) where cpbl_acnt is not null;
  end if;
end $$;

create table if not exists app_settings (
  key text primary key,
  value text
);

-- Drop every existing policy on the three tables (their prior state is unknown).
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('players','team_chants','app_settings')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table players enable row level security;
alter table team_chants enable row level security;
alter table app_settings enable row level security;

create policy "players read" on players for select to anon, authenticated using (true);
create policy "players owner write" on players for all to authenticated
  using ((auth.jwt() ->> 'email') = 'tony798252003@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tony798252003@gmail.com');

create policy "team_chants read" on team_chants for select to anon, authenticated using (true);
create policy "team_chants owner write" on team_chants for all to authenticated
  using ((auth.jwt() ->> 'email') = 'tony798252003@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tony798252003@gmail.com');

create policy "app_settings read" on app_settings for select to anon, authenticated using (true);
create policy "app_settings owner write" on app_settings for all to authenticated
  using ((auth.jwt() ->> 'email') = 'tony798252003@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'tony798252003@gmail.com');
