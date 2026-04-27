-- Reinstall trigger (safe even if it already exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: seed demo data for users who signed up before seeding was added
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT p.user_id
    FROM public.profiles p
    WHERE p.has_demo_data = false
      AND NOT EXISTS (
        SELECT 1 FROM public.accounts a WHERE a.user_id = p.user_id
      )
  LOOP
    PERFORM public.seed_demo_data(rec.user_id);
  END LOOP;
END;
$$;