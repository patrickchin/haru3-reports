-- Truncate reports table to remove old data with the previous structured shape.
-- Pre-launch breaking change: schema simplified (activities/equipment/siteConditions removed,
-- manpower→workers, materials promoted to top-level, cost fields dropped).
TRUNCATE TABLE public.reports CASCADE;
