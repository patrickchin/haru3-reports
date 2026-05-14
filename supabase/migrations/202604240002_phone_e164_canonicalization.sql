CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH cleaned AS (
    SELECT
      trim(coalesce(p_phone, '')) AS original_value,
      regexp_replace(trim(coalesce(p_phone, '')), '\D', '', 'g') AS digits_only
  )
  SELECT CASE
    WHEN digits_only = '' THEN NULL
    WHEN original_value LIKE '+%' AND ('+' || digits_only) ~ '^\+[1-9][0-9]{7,14}$' THEN '+' || digits_only
    WHEN char_length(digits_only) >= 11 AND ('+' || digits_only) ~ '^\+[1-9][0-9]{7,14}$' THEN '+' || digits_only
    ELSE NULL
  END
  FROM cleaned;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_from_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_phone text;
BEGIN
  normalized_phone := coalesce(
    public.normalize_phone_e164(new.phone),
    public.normalize_phone_e164(new.raw_user_meta_data ->> 'phone')
  );

  IF normalized_phone IS NULL THEN
    RETURN new;
  END IF;

  INSERT INTO public.profiles (id, phone, full_name, company_name)
  VALUES (
    new.id,
    normalized_phone,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'company_name'), '')
  )
  ON CONFLICT (id) DO UPDATE
  SET phone = excluded.phone;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_from_auth_user();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

CREATE TRIGGER on_auth_user_updated
AFTER UPDATE OF phone, raw_user_meta_data ON auth.users
FOR EACH ROW
WHEN (old.phone IS DISTINCT FROM new.phone OR old.raw_user_meta_data IS DISTINCT FROM new.raw_user_meta_data)
EXECUTE FUNCTION public.sync_profile_from_auth_user();

UPDATE public.profiles AS p
SET phone = synced.normalized_phone
FROM auth.users AS u
CROSS JOIN LATERAL (
  SELECT coalesce(
    public.normalize_phone_e164(u.phone),
    public.normalize_phone_e164(u.raw_user_meta_data ->> 'phone')
  ) AS normalized_phone
) AS synced
WHERE p.id = u.id
  AND synced.normalized_phone IS NOT NULL
  AND p.phone IS DISTINCT FROM synced.normalized_phone;

UPDATE public.profiles
SET phone = public.normalize_phone_e164(phone)
WHERE public.normalize_phone_e164(phone) IS NOT NULL
  AND phone IS DISTINCT FROM public.normalize_phone_e164(phone);

CREATE OR REPLACE FUNCTION public.lookup_profile_id_by_phone(p_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.profiles
  WHERE phone = public.normalize_phone_e164(p_phone)
  LIMIT 1;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE public.normalize_phone_e164(phone) IS DISTINCT FROM phone
  ) THEN
    RAISE EXCEPTION 'profiles.phone contains non-E.164 values after backfill';
  END IF;
END;
$$;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_phone_e164_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_phone_e164_check
CHECK (public.normalize_phone_e164(phone) = phone);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique_idx
ON public.profiles (phone);
