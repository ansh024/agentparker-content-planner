-- Creator-grade listening rebuild: runs, clusters, briefs, and cumulative hits.

ALTER TABLE listening_topics
  ADD COLUMN IF NOT EXISTS audience TEXT,
  ADD COLUMN IF NOT EXISTS content_format TEXT DEFAULT 'short-form video',
  ADD COLUMN IF NOT EXISTS competitors TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS platform_focus TEXT[] DEFAULT '{instagram,youtube,tiktok}',
  ADD COLUMN IF NOT EXISTS last_run_id UUID;

CREATE TABLE IF NOT EXISTS listening_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES listening_topics(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  source_counts JSONB DEFAULT '{}'::jsonb,
  query_plan JSONB DEFAULT '{}'::jsonb,
  warnings TEXT[] DEFAULT '{}',
  error_message TEXT,
  raw_output_path TEXT,
  total_candidates INTEGER DEFAULT 0,
  total_clusters INTEGER DEFAULT 0,
  total_new_hits INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE listening_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own listening runs" ON listening_runs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own listening runs" ON listening_runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access on listening_runs" ON listening_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS listening_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES listening_runs(id) ON DELETE CASCADE NOT NULL,
  topic_id UUID REFERENCES listening_topics(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  score NUMERIC,
  sources TEXT[] DEFAULT '{}',
  representative_hit_ids UUID[] DEFAULT '{}',
  uncertainty TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE listening_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own listening clusters" ON listening_clusters
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own listening clusters" ON listening_clusters
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on listening_clusters" ON listening_clusters
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE listening_hits
  ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES listening_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cluster_id UUID REFERENCES listening_clusters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS final_score NUMERIC,
  ADD COLUMN IF NOT EXISTS relevance_score NUMERIC,
  ADD COLUMN IF NOT EXISTS fun_score NUMERIC,
  ADD COLUMN IF NOT EXISTS source_quality NUMERIC,
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sighting_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS raw_item JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS listening_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES listening_topics(id) ON DELETE CASCADE NOT NULL,
  run_id UUID REFERENCES listening_runs(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  headline TEXT NOT NULL,
  what_changed TEXT,
  audience_pains TEXT[] DEFAULT '{}',
  content_angles JSONB DEFAULT '[]'::jsonb,
  scripts_or_hooks TEXT[] DEFAULT '{}',
  source_citations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE listening_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own listening briefs" ON listening_briefs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on listening_briefs" ON listening_briefs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE listening_topics
  ADD CONSTRAINT listening_topics_last_run_id_fkey
  FOREIGN KEY (last_run_id) REFERENCES listening_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_listening_runs_topic_created
  ON listening_runs(topic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listening_runs_user_status
  ON listening_runs(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listening_clusters_topic_score
  ON listening_clusters(topic_id, score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_listening_clusters_run
  ON listening_clusters(run_id);

CREATE INDEX IF NOT EXISTS idx_listening_briefs_topic_created
  ON listening_briefs(topic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listening_hits_topic_last_seen
  ON listening_hits(topic_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_listening_hits_run
  ON listening_hits(run_id);

CREATE INDEX IF NOT EXISTS idx_listening_hits_cluster
  ON listening_hits(cluster_id);

GRANT SELECT, INSERT ON listening_runs TO authenticated;
GRANT SELECT, UPDATE ON listening_clusters TO authenticated;
GRANT SELECT ON listening_briefs TO authenticated;
GRANT SELECT, UPDATE ON listening_hits TO authenticated;
