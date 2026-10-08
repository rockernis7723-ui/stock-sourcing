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

-- 2. Product Units (ทะเบียนหน่วยสินค้า)
create table product_units (
  id uuid default gen_random_uuid() primary key,
  erp_unit_code text not null unique,
  name text not null,
  is_active boolean not null default true,
  allow_stock boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_units_stock_dropdown_idx on product_units (sort_order, erp_unit_code, name)
  where is_active = true and allow_stock = true;

insert into product_units (erp_unit_code, name, sort_order) values
  ('00', 'กก.', 1), ('01', 'แพ็ค', 2), ('02', 'กรัม', 3), ('03', 'ลูก', 4),
  ('04', 'ฝัก', 5), ('05', 'มัด', 6), ('06', 'ขวด', 7), ('07', 'ฟอง', 8),
  ('09', 'ซอง', 9), ('10', 'ขวด', 10), ('11', 'หวี', 11), ('12', 'ถุง', 12),
  ('13', 'กล่อง', 13), ('14', 'ลัง', 14), ('15', 'กระป๋อง', 15),
  ('16', 'ตะกร้า', 16), ('17', 'กระสอบ', 17), ('18', 'เข่ง', 18),
  ('19', 'แผง', 19), ('21', 'กำ', 20), ('22', 'พวง', 21), ('23', 'ก้อน', 22),
  ('25', 'ห่อ', 23), ('27', 'แผ่น', 24), ('28', 'กระปุก', 25),
  ('29', 'ตัว', 26), ('31', 'ใบ', 27), ('32', 'หลอด', 28), ('33', 'ถาด', 29),
  ('34', 'ถัง', 30), ('36', 'แท่ง', 31), ('37', 'ครั้ง', 32), ('38', 'ชิ้น', 33),
  ('39', 'อัน', 34), ('41', 'ปี๊บ', 35), ('42', 'ผืน', 36), ('44', 'ถ้วย', 37),
  ('46', 'ม้วน', 38), ('49', 'กระสอบ', 39), ('50', 'อัน', 40),
  ('51', 'เส้น', 41), ('52', 'กระป๋อง', 42), ('53', 'เตา', 43),
  ('54', 'ชุด', 44), ('55', 'หม้อ', 45), ('58', 'ดอก', 46), ('59', 'ด้าม', 47),
  ('61', 'ปี๊บ', 48), ('62', 'แกลลอน', 49), ('66', 'แก้ว', 50),
  ('67', 'กลม', 51), ('69', 'ขวด', 52);

-- 3. Products (สินค้า)
create table products (
  id uuid default gen_random_uuid() primary key,
  barcode text not null unique,
  erp_sku text unique,
  name text not null,
  unit_code text,
  unit text not null,
  current_stock int not null default 0,
  min_stock int not null default 0,
  created_at timestamptz default now()
);

-- 4. ERP Master SKU Registry (ทะเบียน Product Code จาก ERP)
create table erp_master_skus (
  erp_sku text primary key,
  name text not null default '',
  group_name text,
  category text,
  item_type text,
  pack_size text,
  spec_1 text,
  spec_2 text,
  unit text,
  supplier_name text,
  product_id uuid references products on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index erp_master_skus_product_id_idx on erp_master_skus(product_id);

-- 5. Stock Lots (ล็อตสินค้าแต่ละล็อต สำหรับ FEFO)
create table stock_lots (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references products on delete cascade not null,
  quantity int not null default 0,
  expiry_date date not null,
  created_at timestamptz default now()
);

-- 6. Transactions (ประวัติรับเข้า/จ่ายออก)
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
alter table product_units enable row level security;
alter table products enable row level security;
alter table erp_master_skus enable row level security;
alter table stock_lots enable row level security;
alter table transactions enable row level security;

-- Profiles: อ่านได้ทุกคน, แก้ไขได้แค่ admin (จัดการผ่าน service role)
create policy "profiles_select" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_insert" on profiles for insert with check (auth.role() = 'authenticated');
create policy "profiles_update" on profiles for update using (auth.role() = 'authenticated');
create policy "profiles_delete" on profiles for delete using (auth.role() = 'authenticated');

-- Products: ทุก user ที่ login แล้วเข้าถึงได้
create policy "products_all" on products for all using (auth.role() = 'authenticated');

-- Product units: ผู้ใช้ที่ login แล้วอ่านเฉพาะทะเบียนหน่วยได้
create policy "product_units_select" on product_units for select using (auth.role() = 'authenticated');

-- ERP Master SKU: ทุก user ที่ login แล้วอ่านได้ และหน้า Admin/Manager เป็นผู้จัดการข้อมูล
create policy "erp_master_skus_all" on erp_master_skus for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

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
