-- Development-only demo data. FAKE numbers, for building and checking the UI without calling Google Trends.
-- Never run this against production. It targets the local Docker database only:
--
--   docker exec -i inntena-postgres psql -U inntena -d inntena -v ON_ERROR_STOP=1 \
--     -v email=you@example.com < docker/seed-dev.sql
--
-- The user must already exist (register through the app first). The script is safe to run again:
-- it never duplicates keywords or snapshots, and it replaces the related queries it created.

-- The only keywords this script ever creates or modifies. Anything else the user tracks is left untouched.
CREATE TEMP TABLE seed_terms (term text PRIMARY KEY);
INSERT INTO seed_terms VALUES
  ('boho rainbow clipart'), ('watercolor flowers png'), ('christmas tree svg'), ('cottagecore clipart'),
  ('retro sunset png'), ('café illustrations'), ('planner stickers'), ('dinosaur clipart'),
  ('wedding monogram svg'), ('mushroom art'), ('anime eyes png'), ('zodiac signs bundle');

-- Keywords: 11 active (one pinned, one paused) plus one archived, spread over several weeks.
INSERT INTO keywords (user_id, term, category, created_at, removed_at, auto_collect_paused, pinned_at)
SELECT u.id, t.term, t.category, now() - (t.days || ' days')::interval,
       CASE WHEN t.archived THEN now() - interval '3 days' END,
       t.paused,
       CASE WHEN t.pinned THEN now() - interval '1 day' END
FROM users u,
     (VALUES
       ('boho rainbow clipart',   'Clip art',    12, false, false, true),
       ('watercolor flowers png', 'Florals',     20, false, false, false),
       ('christmas tree svg',     'Holidays',    30, false, false, false),
       ('cottagecore clipart',    'Clip art',    25, false, false, false),
       ('retro sunset png',       'Backgrounds', 35, false, false, false),
       ('café illustrations',     'Food',         8, false, false, false),
       ('planner stickers',       'Stickers',    18, false, false, false),
       ('dinosaur clipart',       'Animals',     28, false, true,  false),
       ('wedding monogram svg',   'Weddings',    40, false, false, false),
       ('mushroom art',           'Nature',       5, false, false, false),
       ('anime eyes png',         'Characters',  15, false, false, false),
       ('zodiac signs bundle',    'Astrology',   50, true,  false, false)
     ) AS t(term, category, days, archived, paused, pinned)
WHERE u.email = :'email'
ON CONFLICT DO NOTHING;

-- Extra tracked regions (Worldwide is implicit).
INSERT INTO user_regions (user_id, geo)
SELECT u.id, g.geo FROM users u, (VALUES ('US'), ('MX')) AS g(geo)
WHERE u.email = :'email'
ON CONFLICT DO NOTHING;

-- 90 days of interest per keyword and region. Each series is normalized so its peak is 100, like Google Trends.
-- base/amp/period/phase shape a wave; trend > 0 means rising towards today, < 0 means fading.
WITH params(term, base, amp, period, phase, trend) AS (VALUES
  ('boho rainbow clipart',    45, 10, 9.0, 0.0,  0.45),
  ('watercolor flowers png',  55, 25, 12.0, 1.0, 0.00),
  ('christmas tree svg',      20,  8, 8.0, 2.0,  0.90),
  ('cottagecore clipart',     80, 10, 10.0, 0.5, -0.50),
  ('retro sunset png',        50,  6, 7.0, 3.0,  0.00),
  ('café illustrations',      35, 12, 11.0, 1.5, 0.20),
  ('planner stickers',        60, 15, 5.0, 2.5,  0.05),
  ('dinosaur clipart',        70, 12, 9.0, 0.2, -0.35),
  ('wedding monogram svg',    40, 30, 14.0, 4.0, 0.00),
  ('mushroom art',            25, 10, 8.0, 0.8,  0.80),
  ('anime eyes png',          55, 20, 4.0, 1.1,  0.10),
  ('zodiac signs bundle',     50, 10, 10.0, 0.0, 0.00)
),
geos(geo, shift) AS (VALUES ('', 0.0), ('US', 0.8), ('MX', 1.7)),
raw AS (
  SELECT k.id AS keyword_id, g.geo, d,
         GREATEST(1, p.base + p.amp * sin(d / p.period + p.phase + g.shift) + p.trend * (90 - d)
                     + ((abs(hashtext(p.term || g.geo || d::text)) % 9) - 4)) AS v
  FROM params p
  JOIN keywords k ON k.term = p.term
  JOIN users u ON u.id = k.user_id AND u.email = :'email'
  CROSS JOIN geos g
  CROSS JOIN generate_series(0, 89) AS d
)
INSERT INTO trend_snapshots (keyword_id, geo, date, value)
SELECT keyword_id, geo, to_char(current_date - d, 'YYYY-MM-DD'),
       GREATEST(1, round(100 * v / max(v) OVER (PARTITION BY keyword_id, geo))::int)
FROM raw
ON CONFLICT DO NOTHING;

-- Rising related queries, as Google reports them: raw growth numbers (a few huge ones are "Breakout").
-- Replaced on every run. MX gets a shorter list so the columns differ in length.
DELETE FROM related_queries
WHERE keyword_id IN (
  SELECT k.id FROM keywords k JOIN users u ON u.id = k.user_id
  JOIN seed_terms st ON st.term = k.term WHERE u.email = :'email'
);

WITH rq(term, queries, vals) AS (VALUES
  ('boho rainbow clipart',
     ARRAY['boho rainbow png','boho rainbow svg bundle','boho rainbow sublimation','rainbow arch clipart','boho rainbow watercolor','boho rainbow baby shower','neutral rainbow clipart'],
     ARRAY[836500, 4350, 1250, 650, 300, 120, 60]),
  ('watercolor flowers png',
     ARRAY['watercolor flower wreath png','wildflower watercolor clipart','watercolor peony png','pressed flowers clipart','watercolor floral frame'],
     ARRAY[2900, 800, 450, 140, 70]),
  ('christmas tree svg',
     ARRAY['christmas tree svg free','layered christmas tree svg','christmas tree farm svg','plaid christmas tree svg','christmas tree cricut','mini christmas tree svg','christmas tree png'],
     ARRAY[59000, 9800, 3200, 1500, 800, 350, 90]),
  ('cottagecore clipart',
     ARRAY['cottagecore frog clipart','cottagecore mushroom png','cottagecore aesthetic stickers','cottagecore border clipart'],
     ARRAY[500, 220, 110, 45]),
  ('retro sunset png',
     ARRAY['retro sunset svg','70s sunset clipart','sunset gradient png','retro sun lines png','vintage sunset sublimation','retro palm sunset'],
     ARRAY[1800, 640, 300, 150, 80, 40]),
  ('café illustrations',
     ARRAY['coffee shop clipart','latte art png','cafe menu illustration','coffee cup watercolor','croissant clipart'],
     ARRAY[950, 400, 210, 100, 55]),
  ('planner stickers',
     ARRAY['digital planner stickers goodnotes','weekly kit planner stickers','cute checklist stickers','mood tracker stickers png','budget planner stickers','student planner stickers'],
     ARRAY[7200, 2100, 900, 380, 160, 75]),
  ('dinosaur clipart',
     ARRAY['cute dinosaur png','dinosaur birthday clipart','baby dinosaur watercolor','dino footprint svg'],
     ARRAY[320, 150, 80, 35]),
  ('wedding monogram svg',
     ARRAY['wedding monogram frame svg','floral monogram wedding png','minimalist wedding monogram','monogram circle svg','wedding crest svg'],
     ARRAY[1400, 520, 260, 130, 65]),
  ('mushroom art',
     ARRAY['mushroom clipart png','fairy mushroom watercolor','mushroom line art','amanita mushroom svg','mushroom tattoo flash','mushroom forest illustration','toadstool clipart'],
     ARRAY[46000, 6400, 2200, 940, 410, 180, 85]),
  ('anime eyes png',
     ARRAY['anime eyes clipart','anime eye reference png','kawaii eyes png','manga eyes svg'],
     ARRAY[610, 280, 120, 50]),
  ('zodiac signs bundle',
     ARRAY['zodiac sign svg','astrology clipart','zodiac constellation png'],
     ARRAY[400, 190, 70])
),
geos(geo, mult) AS (VALUES ('', 1.0), ('US', 0.8), ('MX', 1.4))
INSERT INTO related_queries (keyword_id, geo, query, growth_value, collected_at)
SELECT k.id, g.geo, q.query, round(q.val * g.mult)::int::text, now()
FROM rq
JOIN keywords k ON k.term = rq.term
JOIN users u ON u.id = k.user_id AND u.email = :'email'
CROSS JOIN geos g
CROSS JOIN LATERAL unnest(rq.queries, rq.vals) WITH ORDINALITY AS q(query, val, ord)
WHERE g.geo <> 'MX' OR q.ord <= 4;

-- Collection status: healthy everywhere, except "christmas tree svg" in US (blocked: 3 failures in a row).
INSERT INTO keyword_collection_status (keyword_id, geo, last_attempt_at, last_success_at, last_error_message, consecutive_failures)
SELECT k.id, g.geo,
       now() - interval '3 hours',
       CASE WHEN k.term = 'christmas tree svg' AND g.geo = 'US' THEN now() - interval '2 days' ELSE now() - interval '3 hours' END,
       CASE WHEN k.term = 'christmas tree svg' AND g.geo = 'US' THEN 'Too many requests' END,
       CASE WHEN k.term = 'christmas tree svg' AND g.geo = 'US' THEN 3 ELSE 0 END
FROM keywords k
JOIN users u ON u.id = k.user_id AND u.email = :'email'
JOIN seed_terms st ON st.term = k.term
CROSS JOIN (VALUES (''), ('US'), ('MX')) AS g(geo)
WHERE k.removed_at IS NULL
ON CONFLICT (keyword_id, geo) DO UPDATE SET
  last_attempt_at = EXCLUDED.last_attempt_at,
  last_success_at = EXCLUDED.last_success_at,
  last_error_message = EXCLUDED.last_error_message,
  consecutive_failures = EXCLUDED.consecutive_failures;

-- Summary.
SELECT k.term,
       CASE WHEN k.removed_at IS NOT NULL THEN 'archived' WHEN k.pinned_at IS NOT NULL THEN 'pinned' WHEN k.auto_collect_paused THEN 'paused' ELSE 'active' END AS state,
       (SELECT count(*) FROM trend_snapshots s WHERE s.keyword_id = k.id) AS snapshots,
       (SELECT count(*) FROM related_queries r WHERE r.keyword_id = k.id) AS related
FROM keywords k JOIN users u ON u.id = k.user_id
JOIN seed_terms st ON st.term = k.term
WHERE u.email = :'email'
ORDER BY k.id;
