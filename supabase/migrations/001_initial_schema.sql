-- CMP Platform: MongoDB → Supabase Migration
-- Generated: 2026-04-09
-- 51 tables normalized from 10 Mongoose models

-- Supabase uses gen_random_uuid() natively (pgcrypto)

-- ============================================================
-- CORE TABLES
-- ============================================================

-- 1. ROLES
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ROLE PRIVILEGES
CREATE TABLE role_privileges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    privilege VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_role_privileges_role_id ON role_privileges(role_id);

-- 3. SUBSCRIPTIONS (plan definitions)
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_price_id VARCHAR(255) NOT NULL UNIQUE,
    stripe_product_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    workspaces INTEGER NOT NULL DEFAULT 0,
    projects INTEGER NOT NULL DEFAULT 0,
    sitemaps INTEGER NOT NULL DEFAULT 0,
    wireframes INTEGER NOT NULL DEFAULT 0,
    version_history INTEGER NOT NULL DEFAULT 0,
    word_limit INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. USER SUBSCRIPTIONS
CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE, -- FK added after users table
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    subscription_status VARCHAR(30) DEFAULT 'incomplete',
    current_period_end TIMESTAMPTZ,
    last_payment_status VARCHAR(50),
    last_payment_date TIMESTAMPTZ,
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    words_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. USERS
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    company_name VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    photo_path VARCHAR(2048),
    google_id VARCHAR(255),
    verification_code_key INTEGER,
    verification_code_verify BOOLEAN DEFAULT FALSE,
    verification_code_valid_till TIMESTAMPTZ,
    otp_key INTEGER,
    otp_valid_till TIMESTAMPTZ,
    subscription UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);

-- Add FK from user_subscriptions back to users
ALTER TABLE user_subscriptions
    ADD CONSTRAINT fk_user_subscriptions_user_id
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 6. TOKENS
CREATE TABLE tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL,
    uid VARCHAR(36) UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    expires TIMESTAMPTZ NOT NULL,
    blacklisted BOOLEAN DEFAULT FALSE,
    email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tokens_token ON tokens(token);
CREATE INDEX idx_tokens_user_id ON tokens(user_id);

-- ============================================================
-- PROJECTS
-- ============================================================

-- 7. PROJECTS
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. PROJECT MEMBERS
CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- ============================================================
-- CHATS (standalone, not workspace-embedded)
-- ============================================================

-- 9. CHATS
CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chats_user_id ON chats(user_id);

-- 10. MESSAGES
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    text TEXT,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    pdf_path VARCHAR(2048),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_chat_id ON messages(chat_id);

-- ============================================================
-- CREDIT CARDS
-- ============================================================

-- 11. CREDIT CARDS
CREATE TABLE credit_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_id VARCHAR(255) NOT NULL,
    subscription_id VARCHAR(255),
    payment_id VARCHAR(255),
    last4 VARCHAR(4) NOT NULL,
    exp_month INTEGER NOT NULL,
    exp_year INTEGER NOT NULL,
    brand VARCHAR(50) NOT NULL,
    type VARCHAR(20) CHECK (type IN ('Credit', 'Debit')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_credit_cards_user_id ON credit_cards(user_id);

-- ============================================================
-- FEEDBACK
-- ============================================================

-- 12. FEEDBACK
CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    feedback_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. FEEDBACK CATEGORIES
CREATE TABLE feedback_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. FEEDBACK SUBCATEGORIES
CREATE TABLE feedback_subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES feedback_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    selected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ASSESSMENTS (standalone chat-based)
-- ============================================================

-- 15. ASSESSMENTS
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_assessments_user_id ON assessments(user_id);

-- 16. ASSESSMENT MESSAGES
CREATE TABLE assessment_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    text TEXT,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    pdf_path VARCHAR(2048),
    general_info TEXT,
    survey_type VARCHAR(255),
    assessment_name VARCHAR(255),
    check_type VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_assessment_messages_assessment_id ON assessment_messages(assessment_id);

-- ============================================================
-- WORKSPACE ASSESSMENTS
-- ============================================================

-- 17. WORKSPACE ASSESSMENTS
CREATE TABLE workspace_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL, -- FK added after workspaces table
    folder_id UUID NOT NULL,    -- FK added after folders table
    name VARCHAR(255) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    is_soft_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_wa_user_id ON workspace_assessments(user_id);
CREATE INDEX idx_wa_workspace_id ON workspace_assessments(workspace_id);
CREATE INDEX idx_wa_folder_id ON workspace_assessments(folder_id);
CREATE INDEX idx_wa_name ON workspace_assessments(name);
CREATE UNIQUE INDEX idx_wa_folder_name ON workspace_assessments(folder_id, name) WHERE is_soft_deleted = FALSE;

-- 18. ASSESSMENT REPORTS
CREATE TABLE assessment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL UNIQUE REFERENCES workspace_assessments(id) ON DELETE CASCADE,
    is_generated BOOLEAN DEFAULT FALSE,
    title VARCHAR(500) DEFAULT '',
    content TEXT DEFAULT '',
    url VARCHAR(2048) DEFAULT '',
    generated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. ASSESSMENT QA
CREATE TABLE assessment_qa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES workspace_assessments(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT,
    status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'answered')),
    asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_assessment_qa_assessment_id ON assessment_qa(assessment_id);

-- ============================================================
-- DIGITAL PLAYBOOKS
-- ============================================================

-- 20. DIGITAL PLAYBOOKS
CREATE TABLE digital_playbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    message TEXT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_playbooks_user_id ON digital_playbooks(user_id);

-- 21. PLAYBOOK STAGES
CREATE TABLE playbook_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playbook_id UUID NOT NULL REFERENCES digital_playbooks(id) ON DELETE CASCADE,
    stage VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_playbook_stages_playbook_id ON playbook_stages(playbook_id);

-- 22. PLAYBOOK NODES
CREATE TABLE playbook_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id UUID NOT NULL REFERENCES playbook_stages(id) ON DELETE CASCADE,
    heading VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 23. PLAYBOOK STAGE NODE DATA
CREATE TABLE playbook_stage_node_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id UUID NOT NULL REFERENCES playbook_stages(id) ON DELETE CASCADE,
    node_id UUID REFERENCES playbook_nodes(id) ON DELETE CASCADE,
    heading VARCHAR(500),
    description TEXT,
    color VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 24. PLAYBOOK COMMENTS
CREATE TABLE playbook_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_data_id UUID NOT NULL REFERENCES playbook_stage_node_data(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 25. PLAYBOOK COMMENT REPLIES
CREATE TABLE playbook_comment_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES playbook_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WORKSPACES
-- ============================================================

-- 26. WORKSPACES
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_name VARCHAR(500) NOT NULL,
    workspace_description TEXT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT FALSE,
    is_soft_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_workspaces_user_id ON workspaces(user_id);

-- Add FK to workspace_assessments
ALTER TABLE workspace_assessments
    ADD CONSTRAINT fk_wa_workspace_id
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- 27. FOLDERS
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    folder_name VARCHAR(500) NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    is_soft_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_folders_workspace_id ON folders(workspace_id);

-- Add FK to workspace_assessments
ALTER TABLE workspace_assessments
    ADD CONSTRAINT fk_wa_folder_id
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE;

-- ============================================================
-- FOLDER SUB-ITEMS
-- ============================================================

-- 28. FOLDER BUSINESS INFO
CREATE TABLE folder_business_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    company_size INTEGER,
    company_name VARCHAR(500),
    job_title VARCHAR(255),
    industry VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    user_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 29. FOLDER SURVEY INFO
CREATE TABLE folder_survey_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    question TEXT,
    answer TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 30. FOLDER SITEMAP REFERENCES
CREATE TABLE folder_sitemap_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    sitemap_id UUID NOT NULL REFERENCES digital_playbooks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(folder_id, sitemap_id)
);

-- ============================================================
-- FOLDER CHATS (workspace-embedded chats)
-- ============================================================

-- 31. FOLDER CHATS
CREATE TABLE folder_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    version INTEGER DEFAULT 1,
    chat_title VARCHAR(500),
    is_soft_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_folder_chats_folder_id ON folder_chats(folder_id);

-- 32. FOLDER CHAT MESSAGES
CREATE TABLE folder_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES folder_chats(id) ON DELETE CASCADE,
    text TEXT,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    "from" VARCHAR(50) DEFAULT 'user',
    pdf_path VARCHAR(2048),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_fcm_chat_id ON folder_chat_messages(chat_id);

-- 33. CHAT MESSAGE REACTIONS
CREATE TABLE chat_message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES folder_chat_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) CHECK (type IN ('like', 'dislike')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);

-- 34. FOLDER CHAT COMMENTS
CREATE TABLE folder_chat_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES folder_chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES folder_chat_messages(id) ON DELETE SET NULL,
    user_name VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 35. FOLDER CHAT COMMENT REPLIES
CREATE TABLE folder_chat_comment_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES folder_chat_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 36. FOLDER CHAT BOOKMARKS
CREATE TABLE folder_chat_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES folder_chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES folder_chat_messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 37. FOLDER CHAT SHARED USERS
CREATE TABLE folder_chat_shared_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES folder_chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 38. FOLDER CHAT MEDIA
CREATE TABLE folder_chat_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES folder_chats(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    url VARCHAR(2048) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 39. FOLDER CHAT DOCUMENTS
CREATE TABLE folder_chat_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES folder_chats(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    name VARCHAR(500) NOT NULL,
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    size VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 40. FOLDER CHAT LINKS
CREATE TABLE folder_chat_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES folder_chats(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    url VARCHAR(2048) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 41. FOLDER CHAT TASKS
CREATE TABLE folder_chat_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES folder_chats(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    progress INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 42. FOLDER CHAT VERSIONS
CREATE TABLE folder_chat_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES folder_chats(id) ON DELETE CASCADE,
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 43. FOLDER CHAT VERSION USERS
CREATE TABLE folder_chat_version_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES folder_chat_versions(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FOLDER ASSESSMENTS (workspace-embedded)
-- ============================================================

-- 44. FOLDER ASSESSMENTS
CREATE TABLE folder_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    version INTEGER DEFAULT 1,
    is_soft_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_folder_assessments_folder_id ON folder_assessments(folder_id);

-- 45. FOLDER ASSESSMENT REPORTS
CREATE TABLE folder_assessment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES folder_assessments(id) ON DELETE CASCADE,
    final_report TEXT,
    final_report_url VARCHAR(2048),
    report_title VARCHAR(500),
    is_report_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 46. FOLDER ASSESSMENT SUB REPORTS
CREATE TABLE folder_assessment_sub_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES folder_assessment_reports(id) ON DELETE CASCADE,
    final_sub_report TEXT,
    final_sub_report_url VARCHAR(2048),
    report_title VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 47. FOLDER ASSESSMENT SUB REPORT QA
CREATE TABLE folder_assessment_sub_report_qa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_report_id UUID NOT NULL REFERENCES folder_assessment_sub_reports(id) ON DELETE CASCADE,
    question TEXT,
    answer TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FOLDER WIREFRAMES
-- ============================================================

-- 48. FOLDER WIREFRAMES
CREATE TABLE folder_wireframes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    sitemap_id UUID REFERENCES digital_playbooks(id) ON DELETE SET NULL,
    title VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_folder_wireframes_folder_id ON folder_wireframes(folder_id);

-- 49. FOLDER WIREFRAME ENTITIES
CREATE TABLE folder_wireframe_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wireframe_id UUID NOT NULL REFERENCES folder_wireframes(id) ON DELETE CASCADE,
    element VARCHAR(255),
    layout VARCHAR(255),
    text TEXT,
    description TEXT,
    image VARCHAR(2048),
    type VARCHAR(100),
    chart_type VARCHAR(50),
    page_index INTEGER,
    layout_index INTEGER,
    styles JSONB,
    description_styles JSONB,
    table_data JSONB,
    chart_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 50. FOLDER WIREFRAME ELEMENTS
CREATE TABLE folder_wireframe_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES folder_wireframe_entities(id) ON DELETE CASCADE,
    element VARCHAR(255),
    type VARCHAR(100),
    text TEXT,
    style JSONB,
    list TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 51. FOLDER WIREFRAME SHAPES
CREATE TABLE folder_wireframe_shapes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES folder_wireframe_entities(id) ON DELETE CASCADE,
    shape VARCHAR(255),
    style JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FOLDER WIREFRAME COMMENTS (reuses same pattern)
CREATE TABLE folder_wireframe_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wireframe_id UUID NOT NULL REFERENCES folder_wireframes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- USER SHARED CHATS (junction)
CREATE TABLE user_shared_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    chat_id UUID NOT NULL REFERENCES folder_chats(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FOLDER ASSESSMENT SHARED USERS
CREATE TABLE folder_assessment_shared_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES folder_assessments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FOLDER ASSESSMENT MEDIA
CREATE TABLE folder_assessment_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES folder_assessments(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    url VARCHAR(2048) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FOLDER ASSESSMENT TASKS
CREATE TABLE folder_assessment_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES folder_assessments(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    progress INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- FOLDER ASSESSMENT DOCUMENTS
CREATE TABLE folder_assessment_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES folder_assessments(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    name VARCHAR(500) NOT NULL,
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    size VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FOLDER ASSESSMENT LINKS
CREATE TABLE folder_assessment_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES folder_assessments(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    url VARCHAR(2048) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FOLDER ASSESSMENT VERSIONS
CREATE TABLE folder_assessment_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES folder_assessments(id) ON DELETE CASCADE,
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUTO-UPDATE TIMESTAMPS TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.columns
        WHERE column_name = 'updated_at'
        AND table_schema = 'public'
    LOOP
        EXECUTE format('
            CREATE TRIGGER set_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()', t);
    END LOOP;
END;
$$;
