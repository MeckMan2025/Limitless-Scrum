-- Test tables: each "table" a user creates in the Testing section
create table if not exists testing_tables (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  columns jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz default now()
);

-- Test rows: individual rows of data inside a testing table
create table if not exists testing_rows (
  id uuid default gen_random_uuid() primary key,
  table_id uuid not null references testing_tables(id) on delete cascade,
  row_data jsonb not null default '{}'::jsonb,
  row_order int not null default 0,
  created_at timestamptz default now()
);

-- Test charts: saved chart configurations per table
create table if not exists testing_charts (
  id uuid default gen_random_uuid() primary key,
  table_id uuid not null references testing_tables(id) on delete cascade,
  chart_type text not null default 'line',
  x_column text not null,
  y_columns jsonb not null default '[]'::jsonb,
  title text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table testing_tables enable row level security;
alter table testing_rows enable row level security;
alter table testing_charts enable row level security;

-- Open read/write for authenticated (anon key) — matches existing app pattern
create policy "testing_tables_all" on testing_tables for all using (true) with check (true);
create policy "testing_rows_all" on testing_rows for all using (true) with check (true);
create policy "testing_charts_all" on testing_charts for all using (true) with check (true);

-- Indexes
create index if not exists idx_testing_rows_table on testing_rows(table_id);
create index if not exists idx_testing_charts_table on testing_charts(table_id);
