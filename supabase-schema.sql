-- ===================================================
-- STOCK MANAGER - Supabase Schema
-- รันใน Supabase > SQL Editor
-- ===================================================

-- 1. Profiles (ข้อมูล user เพิ่มเติม)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  email text not null,
  role text not null default 'staff' check (role in ('admin', 'manager', 'staff')),
  created_at timestamptz default now()
);

-- 2. Products (สินค้า)
create table products (
  id uuid default gen_random_uuid() primary key,
  barcode text not null unique,
  name text not null,
  unit text not null default 'ชิ้น',
  current_stock int not null default 0,
  min_stock int not null default 0,
  created_at timestamptz default now()
);

-- 3. Stock Lots (ล็อตสินค้าแต่ละล็อต สำหรับ FEFO)
create table stock_lots (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references products on delete cascade not null,
  quantity int not null default 0,
  expiry_date date not null,
  created_at timestamptz default now()
);

-- 4. Transactions (ประวัติรับเข้า/จ่ายออก)
create table transactions (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references products on delete cascade not null,
  type text not null check (type in ('IN', 'OUT')),
  quantity int not null,
  expiry_date date,
  note text,
  created_by uuid references auth.users,
  created_at timestamptz default now()
);

-- ===================================================
-- Function: อัปเดตสต็อกสินค้า
-- ===================================================
create or replace function update_product_stock(p_product_id uuid, p_delta int)
returns void language plpgsql as $$
begin
  update products set current_stock = current_stock + p_delta where id = p_product_id;
end;
$$;

-- ===================================================
-- Function: สรุป IN/OUT รายสัปดาห์ (สำหรับกราฟ Dashboard)
-- ===================================================
create or replace function weekly_summary()
returns table(day text, "in" int, "out" int) language sql as $$
  select
    to_char(d::date, 'DD/MM') as day,
    coalesce(sum(case when t.type = 'IN' then t.quantity else 0 end), 0)::int as "in",
    coalesce(sum(case when t.type = 'OUT' then t.quantity else 0 end), 0)::int as "out"
  from generate_series(current_date - interval '6 days', current_date, interval '1 day') d
  left join transactions t on t.created_at::date = d::date
  group by d
  order by d;
$$;

-- ===================================================
-- Row Level Security (RLS)
-- ===================================================
alter table profiles enable row level security;
alter table products enable row level security;
alter table stock_lots enable row level security;
alter table transactions enable row level security;

-- Profiles: อ่านได้ทุกคน, แก้ไขได้แค่ admin (จัดการผ่าน service role)
create policy "profiles_select" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_insert" on profiles for insert with check (auth.role() = 'authenticated');
create policy "profiles_update" on profiles for update using (auth.role() = 'authenticated');
create policy "profiles_delete" on profiles for delete using (auth.role() = 'authenticated');

-- Products: ทุก user ที่ login แล้วเข้าถึงได้
create policy "products_all" on products for all using (auth.role() = 'authenticated');

-- Stock lots: ทุก user ที่ login แล้วเข้าถึงได้
create policy "stock_lots_all" on stock_lots for all using (auth.role() = 'authenticated');

-- Transactions: ทุก user ที่ login แล้วเข้าถึงได้
create policy "transactions_all" on transactions for all using (auth.role() = 'authenticated');

-- ===================================================
-- Trigger: สร้าง profile อัตโนมัติเมื่อสมัคร user ใหม่
-- ===================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'User'), new.email, 'staff');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
