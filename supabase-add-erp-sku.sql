-- เพิ่มช่องเชื่อมสินค้าจาก ERP กับสินค้าในระบบ Stock
-- รันใน Supabase > SQL Editor เพียงครั้งเดียว

alter table public.products
  add column if not exists erp_sku text;

create unique index if not exists products_erp_sku_unique
  on public.products (erp_sku)
  where erp_sku is not null and erp_sku <> '';

comment on column public.products.erp_sku is
  'รหัส master_sku_product_code จากคอลัมน์ E ของ ERP Export by Buyer';
