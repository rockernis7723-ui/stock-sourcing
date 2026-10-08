-- ===================================================
-- ERP PRODUCT UNITS MASTER
-- รันใน Supabase > SQL Editor หนึ่งครั้ง
-- รองรับฐานข้อมูลเดิมโดยไม่ลบสินค้าและประวัติ Stock
-- ===================================================

alter table public.product_units
  add column if not exists erp_unit_code text;

alter table public.product_units
  drop constraint if exists product_units_name_key;

create unique index if not exists product_units_erp_unit_code_unique
  on public.product_units (erp_unit_code);

drop index if exists public.product_units_stock_dropdown_idx;
create index product_units_stock_dropdown_idx
  on public.product_units (sort_order, erp_unit_code, name)
  where is_active = true and allow_stock = true;

alter table public.products
  add column if not exists unit_code text;

alter table public.products
  alter column unit drop default;

-- จับคู่ข้อมูลเดิมตามชื่อ โดยเลือก Unit Code แรกของชื่อที่ซ้ำกัน
with unit_map (erp_unit_code, name, sort_order) as (
  values
    ('00', 'กก.', 1),
    ('01', 'แพ็ค', 2),
    ('02', 'กรัม', 3),
    ('03', 'ลูก', 4),
    ('04', 'ฝัก', 5),
    ('05', 'มัด', 6),
    ('06', 'ขวด', 7),
    ('07', 'ฟอง', 8),
    ('09', 'ซอง', 9),
    ('10', 'ขวด', 10),
    ('11', 'หวี', 11),
    ('12', 'ถุง', 12),
    ('13', 'กล่อง', 13),
    ('14', 'ลัง', 14),
    ('15', 'กระป๋อง', 15),
    ('16', 'ตะกร้า', 16),
    ('17', 'กระสอบ', 17),
    ('18', 'เข่ง', 18),
    ('19', 'แผง', 19),
    ('21', 'กำ', 20),
    ('22', 'พวง', 21),
    ('23', 'ก้อน', 22),
    ('25', 'ห่อ', 23),
    ('27', 'แผ่น', 24),
    ('28', 'กระปุก', 25),
    ('29', 'ตัว', 26),
    ('31', 'ใบ', 27),
    ('32', 'หลอด', 28),
    ('33', 'ถาด', 29),
    ('34', 'ถัง', 30),
    ('36', 'แท่ง', 31),
    ('37', 'ครั้ง', 32),
    ('38', 'ชิ้น', 33),
    ('39', 'อัน', 34),
    ('41', 'ปี๊บ', 35),
    ('42', 'ผืน', 36),
    ('44', 'ถ้วย', 37),
    ('46', 'ม้วน', 38),
    ('49', 'กระสอบ', 39),
    ('50', 'อัน', 40),
    ('51', 'เส้น', 41),
    ('52', 'กระป๋อง', 42),
    ('53', 'เตา', 43),
    ('54', 'ชุด', 44),
    ('55', 'หม้อ', 45),
    ('58', 'ดอก', 46),
    ('59', 'ด้าม', 47),
    ('61', 'ปี๊บ', 48),
    ('62', 'แกลลอน', 49),
    ('66', 'แก้ว', 50),
    ('67', 'กลม', 51),
    ('69', 'ขวด', 52)
),
first_code_per_name as (
  select distinct on (name) erp_unit_code, name, sort_order
  from unit_map
  order by name, sort_order
)
update public.product_units pu
set erp_unit_code = first_code.erp_unit_code,
    sort_order = first_code.sort_order,
    updated_at = now()
from first_code_per_name first_code
where pu.name = first_code.name
  and pu.erp_unit_code is null;

-- เพิ่ม Unit Code ใหม่ และอัปเดตชื่อให้ตรงกับ ERP
insert into public.product_units
  (erp_unit_code, name, sort_order, is_active, allow_stock)
values
  ('00', 'กก.', 1, true, true),
  ('01', 'แพ็ค', 2, true, true),
  ('02', 'กรัม', 3, true, true),
  ('03', 'ลูก', 4, true, true),
  ('04', 'ฝัก', 5, true, true),
  ('05', 'มัด', 6, true, true),
  ('06', 'ขวด', 7, true, true),
  ('07', 'ฟอง', 8, true, true),
  ('09', 'ซอง', 9, true, true),
  ('10', 'ขวด', 10, true, true),
  ('11', 'หวี', 11, true, true),
  ('12', 'ถุง', 12, true, true),
  ('13', 'กล่อง', 13, true, true),
  ('14', 'ลัง', 14, true, true),
  ('15', 'กระป๋อง', 15, true, true),
  ('16', 'ตะกร้า', 16, true, true),
  ('17', 'กระสอบ', 17, true, true),
  ('18', 'เข่ง', 18, true, true),
  ('19', 'แผง', 19, true, true),
  ('21', 'กำ', 20, true, true),
  ('22', 'พวง', 21, true, true),
  ('23', 'ก้อน', 22, true, true),
  ('25', 'ห่อ', 23, true, true),
  ('27', 'แผ่น', 24, true, true),
  ('28', 'กระปุก', 25, true, true),
  ('29', 'ตัว', 26, true, true),
  ('31', 'ใบ', 27, true, true),
  ('32', 'หลอด', 28, true, true),
  ('33', 'ถาด', 29, true, true),
  ('34', 'ถัง', 30, true, true),
  ('36', 'แท่ง', 31, true, true),
  ('37', 'ครั้ง', 32, true, true),
  ('38', 'ชิ้น', 33, true, true),
  ('39', 'อัน', 34, true, true),
  ('41', 'ปี๊บ', 35, true, true),
  ('42', 'ผืน', 36, true, true),
  ('44', 'ถ้วย', 37, true, true),
  ('46', 'ม้วน', 38, true, true),
  ('49', 'กระสอบ', 39, true, true),
  ('50', 'อัน', 40, true, true),
  ('51', 'เส้น', 41, true, true),
  ('52', 'กระป๋อง', 42, true, true),
  ('53', 'เตา', 43, true, true),
  ('54', 'ชุด', 44, true, true),
  ('55', 'หม้อ', 45, true, true),
  ('58', 'ดอก', 46, true, true),
  ('59', 'ด้าม', 47, true, true),
  ('61', 'ปี๊บ', 48, true, true),
  ('62', 'แกลลอน', 49, true, true),
  ('66', 'แก้ว', 50, true, true),
  ('67', 'กลม', 51, true, true),
  ('69', 'ขวด', 52, true, true)
on conflict (erp_unit_code) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    allow_stock = excluded.allow_stock,
    updated_at = now();

-- หน่วยเดิมที่ไม่มีใน ERP จะไม่แสดงใน Dropdown
update public.product_units
set is_active = false,
    allow_stock = false,
    updated_at = now()
where erp_unit_code is null;

-- เติม Unit Code ให้สินค้าที่ชื่อหน่วยจับคู่ได้เพียงรหัสเดียว
with unique_unit_names as (
  select name, min(erp_unit_code) as erp_unit_code
  from public.product_units
  where erp_unit_code is not null
    and is_active = true
    and allow_stock = true
  group by name
  having count(*) = 1
)
update public.products p
set unit_code = u.erp_unit_code
from unique_unit_names u
where p.unit = u.name
  and p.unit_code is null;

alter table public.product_units enable row level security;

drop policy if exists "product_units_select" on public.product_units;
create policy "product_units_select"
  on public.product_units
  for select
  using (auth.role() = 'authenticated');

comment on table public.product_units is
  'ทะเบียนหน่วย ERP สำหรับ Dropdown ใน Stock';

comment on column public.product_units.erp_unit_code is
  'Unit Code จากเลข 2 หลักท้ายของ master_sku_product_code';

comment on column public.product_units.name is
  'Unit Name ตาม ERP';

comment on column public.products.unit_code is
  'Unit Code ของ ERP ที่เลือกให้สินค้าใน Stock';
