-- Seed data: segments, vehicles, services, settings and SAMPLE products.
-- Product copy/prices are placeholders to be confirmed by Veloce Motor in the admin panel.

insert into public.settings (id, phone, whatsapp, email, address, hours)
values (1, '+91 76228 84414', '917622884414', 'velocemotor.com@gmail.com',
        'Peechanikkad, Angamaly, Ernakulam, Kerala 683572', 'Mon – Sat · 9:00 AM – 6:00 PM')
on conflict (id) do nothing;

insert into public.segments (id, name, blurb, sort) values
  ('cruiser',  'Cruiser & Performance', 'Stability and heavy-duty endurance for Royal Enfield, KTM and Yamaha.', 1),
  ('commuter', 'Commuter Motorcycles',  'Daily reliability, load-bearing strength and mileage comfort.', 2),
  ('scooter',  'Scooters & EV',         'Precision-tuned front and rear suspension for a bump-free city ride.', 3),
  ('care',     'Car & Bike Care',       'Premium wash and care products for every ride.', 4);

insert into public.vehicles (id, brand, model, segment_id, sort) values
  ('re-bullet-350',     'Royal Enfield', 'Bullet 350',   'cruiser', 1),
  ('re-classic-350',    'Royal Enfield', 'Classic 350',  'cruiser', 2),
  ('ktm-duke-200',      'KTM',           'Duke 200',     'cruiser', 3),
  ('ktm-duke-390',      'KTM',           'Duke 390',     'cruiser', 4),
  ('yamaha-fz-s',       'Yamaha',        'FZ-S',         'cruiser', 5),
  ('yamaha-r15',        'Yamaha',        'R15',          'cruiser', 6),
  ('hero-splendor-plus','Hero',          'Splendor Plus','commuter', 7),
  ('honda-shine',       'Honda',         'Shine',        'commuter', 8),
  ('bajaj-platina',     'Bajaj',         'Platina',      'commuter', 9),
  ('bajaj-ct-100',      'Bajaj',         'CT 100',       'commuter', 10),
  ('honda-activa',      'Honda',         'Activa',       'scooter', 11),
  ('ev-entry-level',    'Electric',      'Entry-level EV scooters', 'scooter', 12);

insert into public.services (id, name, description, price_from, duration_min, sort) values
  ('fitting',    'Suspension Fitting',    'Professional installation of your new Veloce suspension, including setup for your weight and riding style.', 299, 45, 1),
  ('servicing',  'Suspension Servicing',  'Oil change, seal replacement, re-gassing and damper check to restore factory-fresh ride quality.', 799, 90, 2),
  ('inspection', 'Inspection & Check-up', 'Ride-quality assessment, leak and wear check, and a clear report with recommendations.', 149, 30, 3),
  ('washing',    'Washing & Detailing',   'Foam wash with Veloce Hydrophobic Shampoo, plus chain cleaning and a spot-free microfibre dry.', 349, 60, 4);

insert into public.products (slug, name, segment_id, position, short_desc, description, specs, price, mrp, is_featured, sort) values
  ('vx-r-twin-gas-shock-royal-enfield', 'VX-R Twin Gas Shock', 'cruiser', 'Rear pair',
   'Nitrogen-charged twin shocks tuned for the weight and torque of Royal Enfield 350s.',
   'Engineered for long highway stints and broken village roads alike. A nitrogen-charged twin-tube design resists fade on long rides, while 5-step preload lets you set up for solo or pillion riding.',
   '[{"label":"Type","value":"Twin-tube, nitrogen charged"},{"label":"Eye-to-eye length","value":"360 mm"},{"label":"Preload","value":"5-step adjustable"},{"label":"Spring finish","value":"Volt Blue powder coat"},{"label":"Warranty","value":"12 months"}]',
   6499, 7299, true, 1),
  ('vx-r-front-fork-kit-royal-enfield', 'VX-R Front Fork Kit', 'cruiser', 'Front',
   'Hard-chromed stanchions and progressive springs for a planted front end.',
   'Progressive-rate springs and revalved dampers reduce nose-dive under braking and soak up potholes without bottoming out.',
   '[{"label":"Type","value":"Telescopic, progressive spring"},{"label":"Stanchion","value":"35 mm hard-chrome"},{"label":"Oil","value":"SAE 10W fork oil"},{"label":"Warranty","value":"12 months"}]',
   8999, 9999, false, 2),
  ('apex-mono-shock-ktm-duke', 'APEX Mono Shock', 'cruiser', 'Rear',
   'Piggy-back reservoir mono-shock for sharp, consistent handling.',
   'An external reservoir increases oil volume for consistent damping during spirited riding. Rebound and preload are adjustable.',
   '[{"label":"Type","value":"Mono, piggy-back reservoir"},{"label":"Adjustments","value":"Preload + rebound"},{"label":"Spring finish","value":"Chrome silver"},{"label":"Warranty","value":"12 months"}]',
   9499, 10999, true, 3),
  ('apex-s-mono-shock-yamaha-fz-r15', 'APEX-S Mono Shock', 'cruiser', 'Rear',
   'Sport-tuned mono-shock for Yamaha FZ and R15.',
   'Stiffer compression for confident cornering and a progressive feel over speed breakers.',
   '[{"label":"Type","value":"Mono, gas charged"},{"label":"Preload","value":"7-step adjustable"},{"label":"Spring finish","value":"Racing red"},{"label":"Warranty","value":"12 months"}]',
   5999, 6799, false, 4),
  ('commuter-pro-rear-shock-pair', 'Commuter PRO Rear Pair', 'commuter', 'Rear pair',
   'Load-bearing comfort for everyday riding with pillion and luggage.',
   'Dual-rate springs stay soft for solo riding and firm up when you carry a pillion or a load, giving a smooth ride on every commute.',
   '[{"label":"Type","value":"Hydraulic twin shock"},{"label":"Eye-to-eye length","value":"330 mm"},{"label":"Spring","value":"Dual-rate"},{"label":"Warranty","value":"12 months"}]',
   1899, 2199, true, 5),
  ('commuter-pro-front-fork', 'Commuter PRO Front Fork', 'commuter', 'Front',
   'Leak-resistant seals and smooth travel for daily commuters.',
   'Double-lip seals keep dust and water out during the monsoon. A factory replacement fit means no modification is needed.',
   '[{"label":"Type","value":"Telescopic hydraulic"},{"label":"Seals","value":"Double-lip, monsoon-rated"},{"label":"Warranty","value":"12 months"}]',
   2799, 3199, false, 6),
  ('cityglide-rear-shock-activa', 'CityGlide Rear Shock', 'scooter', 'Rear',
   'Bump-free urban rides for Honda Activa.',
   'A softer initial stroke absorbs speed breakers and potholes, while a firm end-stroke prevents bottoming with a pillion.',
   '[{"label":"Type","value":"Hydraulic, single side"},{"label":"Spring","value":"Progressive"},{"label":"Spring finish","value":"Gloss black"},{"label":"Warranty","value":"12 months"}]',
   1499, 1699, true, 7),
  ('e-ride-ev-rear-shock', 'E-Ride EV Rear Shock', 'scooter', 'Rear',
   'Tuned for the weight of battery packs on entry-level electric scooters.',
   'A higher spring rate supports the battery weight without sacrificing comfort, for a quieter and smoother EV ride.',
   '[{"label":"Type","value":"Hydraulic"},{"label":"Spring","value":"High-rate progressive"},{"label":"Warranty","value":"12 months"}]',
   1799, 1999, false, 8),
  ('hydrophobic-wash-shampoo-200ml', 'Hydrophobic Wash Shampoo 200 ml', 'care', null,
   'pH-neutral, high-foaming car & bike wash. Deep clean, rich foam, safe shine.',
   'A high-sudsing, pH-balanced formula designed to safely lift dirt, road grime and grease without stripping your vehicle''s existing wax or ceramic coating. It leaves a brilliant, water-spot-free finish.',
   '[{"label":"Volume","value":"200 ml"},{"label":"Formula","value":"pH neutral, high-foaming"},{"label":"Dilution","value":"20 ml (2 caps) per 5 L water"},{"label":"Shelf life","value":"24 months"}]',
   249, 249, true, 9),
  ('hydrophobic-wash-shampoo-500ml', 'Hydrophobic Wash Shampoo 500 ml', 'care', null,
   'Value pack of the pH-neutral hydrophobic wash.',
   'The same hydrophobic formula in a larger bottle for regular washing at home or at the workshop.',
   '[{"label":"Volume","value":"500 ml"},{"label":"Formula","value":"pH neutral, high-foaming"},{"label":"Dilution","value":"20 ml (2 caps) per 5 L water"},{"label":"Shelf life","value":"24 months"}]',
   499, 499, false, 10);

insert into public.product_fitment (product_id, vehicle_id)
select p.id, f.vehicle_id
from (values
  ('vx-r-twin-gas-shock-royal-enfield', 're-bullet-350'),
  ('vx-r-twin-gas-shock-royal-enfield', 're-classic-350'),
  ('vx-r-front-fork-kit-royal-enfield', 're-bullet-350'),
  ('vx-r-front-fork-kit-royal-enfield', 're-classic-350'),
  ('apex-mono-shock-ktm-duke', 'ktm-duke-200'),
  ('apex-mono-shock-ktm-duke', 'ktm-duke-390'),
  ('apex-s-mono-shock-yamaha-fz-r15', 'yamaha-fz-s'),
  ('apex-s-mono-shock-yamaha-fz-r15', 'yamaha-r15'),
  ('commuter-pro-rear-shock-pair', 'hero-splendor-plus'),
  ('commuter-pro-rear-shock-pair', 'honda-shine'),
  ('commuter-pro-rear-shock-pair', 'bajaj-platina'),
  ('commuter-pro-rear-shock-pair', 'bajaj-ct-100'),
  ('commuter-pro-front-fork', 'hero-splendor-plus'),
  ('commuter-pro-front-fork', 'honda-shine'),
  ('commuter-pro-front-fork', 'bajaj-platina'),
  ('cityglide-rear-shock-activa', 'honda-activa'),
  ('e-ride-ev-rear-shock', 'ev-entry-level')
) as f(slug, vehicle_id)
join public.products p on p.slug = f.slug;
