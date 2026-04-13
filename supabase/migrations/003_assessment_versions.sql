-- Assessment version history for restore functionality
CREATE TABLE IF NOT EXISTS assessment_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  report_content TEXT NOT NULL,
  messages_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assessment_id, version_number)
);

CREATE INDEX idx_assessment_versions_assessment_id ON assessment_versions(assessment_id);

-- Subscriptions table (for Stripe plans)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_product_id TEXT,
  stripe_price_id TEXT UNIQUE,
  name TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  workspaces INTEGER DEFAULT 1,
  projects INTEGER DEFAULT 1,
  sitemaps INTEGER DEFAULT 1,
  wireframes INTEGER DEFAULT 1,
  version_history INTEGER DEFAULT 2,
  word_limit INTEGER DEFAULT 10000,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User subscriptions tracking
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'inactive',
  current_period_end TIMESTAMPTZ,
  last_payment_status TEXT,
  last_payment_date TIMESTAMPTZ,
  words_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
