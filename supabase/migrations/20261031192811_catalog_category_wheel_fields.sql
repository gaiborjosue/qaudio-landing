-- The home page wheel reads categories from here too, so the table carries its
-- short wheel label and atmosphere photo (formerly in lib/categories.ts).
alter table public.catalog_categories
  add column wheel_label text,
  add column scene_path text;

update public.catalog_categories as c
set wheel_label = v.wheel_label, scene_path = v.scene_path
from (values
  ('amplifiers', 'Amplifiers', '/category-scenes/amplifiers.jpeg'),
  ('av-furniture', 'AV Furniture', '/category-scenes/av-furniture.jpeg'),
  ('cables', 'Cables', '/category-scenes/cables.jpeg'),
  ('cd-sacd', 'CD / SACD', '/category-scenes/cd-sacd.png'),
  ('thorens-parts', 'Thorens Parts', '/category-scenes/thorens-parts.png'),
  ('headphones', 'Headphones', '/category-scenes/headphones.png'),
  ('network-players', 'Network Players', '/category-scenes/network-players.png'),
  ('phono-cartridges', 'Phono Cartridges', '/category-scenes/phono-cartridges.webp'),
  ('preamplifiers', 'Preamplifiers', '/category-scenes/preamplifiers.jpg'),
  ('receivers', 'Receivers', '/category-scenes/receivers.jpeg'),
  ('speakers', 'Speakers', '/category-scenes/speakers.jpeg'),
  ('subwoofers', 'Subwoofers', '/category-scenes/subwoofers.jpg'),
  ('turntables', 'Turntables', '/category-scenes/turntables.jpg'),
  ('used-equipment', 'Used Equipment', '/category-scenes/used-equipment.jpeg')
) as v(slug, wheel_label, scene_path)
where c.slug = v.slug;

-- Fails (and rolls back) if any existing category was left without values.
alter table public.catalog_categories
  alter column wheel_label set not null,
  alter column scene_path set not null,
  add constraint catalog_categories_wheel_label_check
    check (char_length(btrim(wheel_label)) between 1 and 40),
  add constraint catalog_categories_scene_path_check
    check (scene_path like '/category-scenes/%');

comment on column public.catalog_categories.name is 'Full category title (shop page heading, wheel caption).';
comment on column public.catalog_categories.wheel_label is 'Short label on the home page category wheel.';
comment on column public.catalog_categories.scene_path is 'Atmosphere photo behind the wheel preview, under public/category-scenes/.';
