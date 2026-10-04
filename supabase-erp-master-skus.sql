-- ===================================================
-- ERP MASTER SKU REGISTRY
-- รันใน Supabase > SQL Editor หนึ่งครั้งก่อนนำเข้า master-skus-export.csv
-- ===================================================

create table if not exists public.erp_master_skus (
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
  product_id uuid references public.products(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists erp_master_skus_product_id_idx
  on public.erp_master_skus(product_id);

alter table public.erp_master_skus enable row level security;

drop policy if exists "erp_master_skus_all" on public.erp_master_skus;
create policy "erp_master_skus_all"
  on public.erp_master_skus
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

comment on table public.erp_master_skus is
  'ทะเบียน Master SKU จาก ERP สำหรับจับคู่ Product Code กับสินค้าใน Stock';

comment on column public.erp_master_skus.erp_sku is
  'ค่า master_sku_product_code จากคอลัมน์ A ของไฟล์ master-skus-export.csv เก็บเป็นข้อความเพื่อรักษาเลข 0 ด้านหน้า';

comment on column public.erp_master_skus.product_id is
  'สินค้าในระบบ Stock ที่จับคู่กับ ERP SKU นี้';
