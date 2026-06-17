-- Harden new Listening RLS policies and lock down the public signup trigger function.

DROP POLICY IF EXISTS "Users can read own listening runs" ON listening_runs;
DROP POLICY IF EXISTS "Users can insert own listening runs" ON listening_runs;
DROP POLICY IF EXISTS "Users can read own listening clusters" ON listening_clusters;
DROP POLICY IF EXISTS "Users can update own listening clusters" ON listening_clusters;
DROP POLICY IF EXISTS "Users can read own listening briefs" ON listening_briefs;

CREATE POLICY "Users can read own listening runs" ON listening_runs
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own listening runs" ON listening_runs
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can read own listening clusters" ON listening_clusters
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own listening clusters" ON listening_clusters
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can read own listening briefs" ON listening_briefs
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
