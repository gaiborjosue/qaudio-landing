-- Security regression checks. All fixture rows and writes are rolled back.
begin;
create temp table catalog_access_results (role_name text, check_name text, passed boolean);
grant select, insert on catalog_access_results to anon, authenticated, service_role;
select set_config('catalog.test_admin', (select user_id::text from private.admins limit 1), true);
insert into public.products(slug,category_slug,brand_slug,name,price_cents,condition,status) values ('catalog-hidden-probe','turntables','u-turn-audio','Hidden probe',100,'New','draft');
insert into public.product_images(product_id,path,alt,width,height) select id,'products/hidden-probe.webp','Hidden probe',1,1 from public.products where slug='catalog-hidden-probe';

set local role anon;
select set_config('request.jwt.claims', json_build_object('role','anon','sub','00000000-0000-0000-0000-000000000001' )::text, true);
insert into catalog_access_results select 'anon', 'visible products and images',
 (select count(*) from public.products) = 1 and (select count(*) from public.product_images) = 5;
insert into catalog_access_results select 'anon', 'taxonomy readable', (select count(*) from public.catalog_categories) = 14 and (select count(*) from public.catalog_brands) = 23;
DO $$ declare n integer; begin
 begin
 insert into public.catalog_categories(slug,name,artwork_path) values ('catalog-access-probe','Probe','/categories/turntables.png');
 raise exception 'Unexpected insert allowed';
 exception when insufficient_privilege then insert into catalog_access_results values ('anon', 'catalog_categories: insert denied', true); end;
 begin
 update public.catalog_categories set name=name;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('anon', 'catalog_categories: update denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('anon', 'catalog_categories: update denied', true); end;
 begin
 delete from public.catalog_categories;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('anon', 'catalog_categories: delete denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('anon', 'catalog_categories: delete denied', true); end;
end $$;
DO $$ declare n integer; begin
 begin
 insert into public.catalog_brands(slug,name,logo_path) values ('catalog-access-probe','Probe','/brands/u-turn-audio.jpg');
 raise exception 'Unexpected insert allowed';
 exception when insufficient_privilege then insert into catalog_access_results values ('anon', 'catalog_brands: insert denied', true); end;
 begin
 update public.catalog_brands set name=name;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('anon', 'catalog_brands: update denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('anon', 'catalog_brands: update denied', true); end;
 begin
 delete from public.catalog_brands;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('anon', 'catalog_brands: delete denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('anon', 'catalog_brands: delete denied', true); end;
end $$;
DO $$ declare n integer; begin
 begin
 insert into public.products(slug,category_slug,brand_slug,name,price_cents,condition,status) values ('catalog-access-probe','turntables','u-turn-audio','Probe',100,'New','draft');
 raise exception 'Unexpected insert allowed';
 exception when insufficient_privilege then insert into catalog_access_results values ('anon', 'products: insert denied', true); end;
 begin
 update public.products set name=name;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('anon', 'products: update denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('anon', 'products: update denied', true); end;
 begin
 delete from public.products;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('anon', 'products: delete denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('anon', 'products: delete denied', true); end;
end $$;
DO $$ declare n integer; begin
 begin
 insert into public.product_images(product_id,path,alt,width,height,sort_order) select id,'products/access-probe.webp','Probe',1,1,99 from public.products where slug='u-turn-audio-orbit-theory';
 raise exception 'Unexpected insert allowed';
 exception when insufficient_privilege then insert into catalog_access_results values ('anon', 'product_images: insert denied', true); end;
 begin
 update public.product_images set alt=alt;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('anon', 'product_images: update denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('anon', 'product_images: update denied', true); end;
 begin
 delete from public.product_images;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('anon', 'product_images: delete denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('anon', 'product_images: delete denied', true); end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('role','authenticated','sub','00000000-0000-0000-0000-000000000001' )::text, true);
insert into catalog_access_results select 'nonadmin', 'visible products and images',
 (select count(*) from public.products) = 1 and (select count(*) from public.product_images) = 5;
insert into catalog_access_results select 'nonadmin', 'taxonomy readable', (select count(*) from public.catalog_categories) = 14 and (select count(*) from public.catalog_brands) = 23;
DO $$ declare n integer; begin
 begin
 insert into public.catalog_categories(slug,name,artwork_path) values ('catalog-access-probe','Probe','/categories/turntables.png');
 raise exception 'Unexpected insert allowed';
 exception when insufficient_privilege then insert into catalog_access_results values ('nonadmin', 'catalog_categories: insert denied', true); end;
 begin
 update public.catalog_categories set name=name;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('nonadmin', 'catalog_categories: update denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('nonadmin', 'catalog_categories: update denied', true); end;
 begin
 delete from public.catalog_categories;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('nonadmin', 'catalog_categories: delete denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('nonadmin', 'catalog_categories: delete denied', true); end;
end $$;
DO $$ declare n integer; begin
 begin
 insert into public.catalog_brands(slug,name,logo_path) values ('catalog-access-probe','Probe','/brands/u-turn-audio.jpg');
 raise exception 'Unexpected insert allowed';
 exception when insufficient_privilege then insert into catalog_access_results values ('nonadmin', 'catalog_brands: insert denied', true); end;
 begin
 update public.catalog_brands set name=name;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('nonadmin', 'catalog_brands: update denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('nonadmin', 'catalog_brands: update denied', true); end;
 begin
 delete from public.catalog_brands;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('nonadmin', 'catalog_brands: delete denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('nonadmin', 'catalog_brands: delete denied', true); end;
end $$;
DO $$ declare n integer; begin
 begin
 insert into public.products(slug,category_slug,brand_slug,name,price_cents,condition,status) values ('catalog-access-probe','turntables','u-turn-audio','Probe',100,'New','draft');
 raise exception 'Unexpected insert allowed';
 exception when insufficient_privilege then insert into catalog_access_results values ('nonadmin', 'products: insert denied', true); end;
 begin
 update public.products set name=name;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('nonadmin', 'products: update denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('nonadmin', 'products: update denied', true); end;
 begin
 delete from public.products;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('nonadmin', 'products: delete denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('nonadmin', 'products: delete denied', true); end;
end $$;
DO $$ declare n integer; begin
 begin
 insert into public.product_images(product_id,path,alt,width,height,sort_order) select id,'products/access-probe.webp','Probe',1,1,99 from public.products where slug='u-turn-audio-orbit-theory';
 raise exception 'Unexpected insert allowed';
 exception when insufficient_privilege then insert into catalog_access_results values ('nonadmin', 'product_images: insert denied', true); end;
 begin
 update public.product_images set alt=alt;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('nonadmin', 'product_images: update denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('nonadmin', 'product_images: update denied', true); end;
 begin
 delete from public.product_images;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('nonadmin', 'product_images: delete denied', n=0);
 exception when insufficient_privilege then insert into catalog_access_results values ('nonadmin', 'product_images: delete denied', true); end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('catalog.test_admin') )::text, true);
insert into catalog_access_results select 'admin', 'visible products and images',
 (select count(*) from public.products) = 2 and (select count(*) from public.product_images) = 6;
insert into catalog_access_results select 'admin', 'taxonomy readable', (select count(*) from public.catalog_categories) = 14 and (select count(*) from public.catalog_brands) = 23;
DO $$ declare n integer; begin
 insert into public.catalog_categories(slug,name,artwork_path) values ('catalog-access-probe','Probe','/categories/turntables.png');
 get diagnostics n = row_count;
 insert into catalog_access_results values ('admin', 'catalog_categories: insert', n=1);
 update public.catalog_categories set name=name where slug='catalog-access-probe';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('admin', 'catalog_categories: update', n=1);
 delete from public.catalog_categories where slug='catalog-access-probe';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('admin', 'catalog_categories: delete', n=1);
end $$;
DO $$ declare n integer; begin
 insert into public.catalog_brands(slug,name,logo_path) values ('catalog-access-probe','Probe','/brands/u-turn-audio.jpg');
 get diagnostics n = row_count;
 insert into catalog_access_results values ('admin', 'catalog_brands: insert', n=1);
 update public.catalog_brands set name=name where slug='catalog-access-probe';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('admin', 'catalog_brands: update', n=1);
 delete from public.catalog_brands where slug='catalog-access-probe';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('admin', 'catalog_brands: delete', n=1);
end $$;
DO $$ declare n integer; begin
 insert into public.products(slug,category_slug,brand_slug,name,price_cents,condition,status) values ('catalog-access-probe','turntables','u-turn-audio','Probe',100,'New','draft');
 get diagnostics n = row_count;
 insert into catalog_access_results values ('admin', 'products: insert', n=1);
 update public.products set name=name where slug='catalog-access-probe';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('admin', 'products: update', n=1);
 delete from public.products where slug='catalog-access-probe';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('admin', 'products: delete', n=1);
end $$;
DO $$ declare n integer; begin
 insert into public.product_images(product_id,path,alt,width,height,sort_order) select id,'products/access-probe.webp','Probe',1,1,99 from public.products where slug='u-turn-audio-orbit-theory';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('admin', 'product_images: insert', n=1);
 update public.product_images set alt=alt where sort_order=99;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('admin', 'product_images: update', n=1);
 delete from public.product_images where sort_order=99;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('admin', 'product_images: delete', n=1);
end $$;
reset role;

set local role service_role;
select set_config('request.jwt.claims', json_build_object('role','service_role','sub','00000000-0000-0000-0000-000000000001' )::text, true);
insert into catalog_access_results select 'service_role', 'visible products and images',
 (select count(*) from public.products) = 2 and (select count(*) from public.product_images) = 6;
insert into catalog_access_results select 'service_role', 'taxonomy readable', (select count(*) from public.catalog_categories) = 14 and (select count(*) from public.catalog_brands) = 23;
DO $$ declare n integer; begin
 insert into public.catalog_categories(slug,name,artwork_path) values ('catalog-access-probe','Probe','/categories/turntables.png');
 get diagnostics n = row_count;
 insert into catalog_access_results values ('service_role', 'catalog_categories: insert', n=1);
 update public.catalog_categories set name=name where slug='catalog-access-probe';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('service_role', 'catalog_categories: update', n=1);
 delete from public.catalog_categories where slug='catalog-access-probe';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('service_role', 'catalog_categories: delete', n=1);
end $$;
DO $$ declare n integer; begin
 insert into public.catalog_brands(slug,name,logo_path) values ('catalog-access-probe','Probe','/brands/u-turn-audio.jpg');
 get diagnostics n = row_count;
 insert into catalog_access_results values ('service_role', 'catalog_brands: insert', n=1);
 update public.catalog_brands set name=name where slug='catalog-access-probe';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('service_role', 'catalog_brands: update', n=1);
 delete from public.catalog_brands where slug='catalog-access-probe';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('service_role', 'catalog_brands: delete', n=1);
end $$;
DO $$ declare n integer; begin
 insert into public.products(slug,category_slug,brand_slug,name,price_cents,condition,status) values ('catalog-access-probe','turntables','u-turn-audio','Probe',100,'New','draft');
 get diagnostics n = row_count;
 insert into catalog_access_results values ('service_role', 'products: insert', n=1);
 update public.products set name=name where slug='catalog-access-probe';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('service_role', 'products: update', n=1);
 delete from public.products where slug='catalog-access-probe';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('service_role', 'products: delete', n=1);
end $$;
DO $$ declare n integer; begin
 insert into public.product_images(product_id,path,alt,width,height,sort_order) select id,'products/access-probe.webp','Probe',1,1,99 from public.products where slug='u-turn-audio-orbit-theory';
 get diagnostics n = row_count;
 insert into catalog_access_results values ('service_role', 'product_images: insert', n=1);
 update public.product_images set alt=alt where sort_order=99;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('service_role', 'product_images: update', n=1);
 delete from public.product_images where sort_order=99;
 get diagnostics n = row_count;
 insert into catalog_access_results values ('service_role', 'product_images: delete', n=1);
end $$;
reset role;
DO $$ begin if exists (select 1 from catalog_access_results where not passed) then raise exception 'Catalog access regression'; end if; end $$;
select role_name, count(*) as checks, bool_and(passed) as all_passed from catalog_access_results group by role_name order by role_name;
rollback;

