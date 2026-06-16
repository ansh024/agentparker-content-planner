-- Repair: Complete schema for any tables/policies not created
-- in the partially-applied 00001 migration

-- Profiles (if not exists)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  telegram_chat_id BIGINT,
  instagram_business_id TEXT,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ideas
CREATE TABLE IF NOT EXISTS ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  source_url TEXT NOT NULL,
  source_platform TEXT,
  source_author TEXT,
  context_text TEXT,
  title TEXT,
  ai_summary TEXT,
  og_image_url TEXT,
  status TEXT DEFAULT 'new',
  tags TEXT[],
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Content plans
CREATE TABLE IF NOT EXISTS content_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  target_platform TEXT DEFAULT 'instagram',
  status TEXT DEFAULT 'planned',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Listening topics
CREATE TABLE IF NOT EXISTS listening_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  platforms TEXT[] DEFAULT '{reddit,hackernews,youtube}',
  frequency TEXT DEFAULT 'daily',
  active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Listening hits
CREATE TABLE IF NOT EXISTS listening_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES listening_topics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  source_url TEXT NOT NULL,
  platform TEXT,
  title TEXT,
  snippet TEXT,
  author TEXT,
  engagement_score INTEGER,
  published_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(topic_id, source_url)
);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  UNIQUE(user_id, name)
);

-- ── RLS: enable on all tables ──────────────────────────────────

DO $$ BEGIN
  ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
  ALTER TABLE content_plans ENABLE ROW LEVEL SECURITY;
  ALTER TABLE listening_topics ENABLE ROW LEVEL SECURITY;
  ALTER TABLE listening_hits ENABLE ROW LEVEL SECURITY;
  ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── RLS policies: drop + recreate ─────────────────────────────

-- profiles
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ideas
DROP POLICY IF EXISTS "Users can read own ideas" ON ideas;
CREATE POLICY "Users can read own ideas" ON ideas FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own ideas" ON ideas;
CREATE POLICY "Users can insert own ideas" ON ideas FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own ideas" ON ideas;
CREATE POLICY "Users can update own ideas" ON ideas FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own ideas" ON ideas;
CREATE POLICY "Users can delete own ideas" ON ideas FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role full access on ideas" ON ideas;
CREATE POLICY "Service role full access on ideas" ON ideas FOR ALL TO service_role USING (true) WITH CHECK (true);

-- content_plans
DROP POLICY IF EXISTS "Users can read own plans" ON content_plans;
CREATE POLICY "Users can read own plans" ON content_plans FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own plans" ON content_plans;
CREATE POLICY "Users can insert own plans" ON content_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own plans" ON content_plans;
CREATE POLICY "Users can update own plans" ON content_plans FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own plans" ON content_plans;
CREATE POLICY "Users can delete own plans" ON content_plans FOR DELETE USING (auth.uid() = user_id);

-- listening_topics
DROP POLICY IF EXISTS "Users can read own topics" ON listening_topics;
CREATE POLICY "Users can read own topics" ON listening_topics FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own topics" ON listening_topics;
CREATE POLICY "Users can insert own topics" ON listening_topics FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own topics" ON listening_topics;
CREATE POLICY "Users can update own topics" ON listening_topics FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own topics" ON listening_topics;
CREATE POLICY "Users can delete own topics" ON listening_topics FOR DELETE USING (auth.uid() = user_id);

-- listening_hits
DROP POLICY IF EXISTS "Users can read own hits" ON listening_hits;
CREATE POLICY "Users can read own hits" ON listening_hits FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own hits" ON listening_hits;
CREATE POLICY "Users can insert own hits" ON listening_hits FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role full access on listening_hits" ON listening_hits;
CREATE POLICY "Service role full access on listening_hits" ON listening_hits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- tags
DROP POLICY IF EXISTS "Users can read own tags" ON tags;
CREATE POLICY "Users can read own tags" ON tags FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own tags" ON tags;
CREATE POLICY "Users can insert own tags" ON tags FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own tags" ON tags;
CREATE POLICY "Users can update own tags" ON tags FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own tags" ON tags;
CREATE POLICY "Users can delete own tags" ON tags FOR DELETE USING (auth.uid() = user_id);

-- ── Indexes ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ideas_user_status ON ideas(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ideas_user_created ON ideas(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_plans_user_date ON content_plans(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_listening_topics_user_active ON listening_topics(user_id, active);
CREATE INDEX IF NOT EXISTS idx_listening_hits_topic ON listening_hits(topic_id, captured_at DESC);

-- ── Realtime ───────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE ideas;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE content_plans;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE listening_hits;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
