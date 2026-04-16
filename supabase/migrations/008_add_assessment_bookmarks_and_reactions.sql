-- 008: Add assessment bookmarks and reactions tables
-- These mirror folder_chat_bookmarks and chat_message_reactions but reference
-- workspace_assessments and assessment_qa instead.

-- Assessment bookmarks
CREATE TABLE IF NOT EXISTS assessment_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES workspace_assessments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES assessment_qa(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_assessment_bookmarks_assessment_id ON assessment_bookmarks(assessment_id);
CREATE INDEX idx_assessment_bookmarks_user_id ON assessment_bookmarks(user_id);

-- Assessment message reactions (like / dislike)
CREATE TABLE IF NOT EXISTS assessment_message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES assessment_qa(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) CHECK (type IN ('like', 'dislike')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);
CREATE INDEX idx_assessment_message_reactions_message_id ON assessment_message_reactions(message_id);
