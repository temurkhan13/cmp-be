# CMP Backend: MongoDB → Supabase Migration Summary

**Date:** April 9, 2026
**Scope:** Full database migration from MongoDB/Mongoose to Supabase (PostgreSQL)

---

## What Was Done

### 1. Supabase Project Created
- **Project:** `cmp-platform`
- **Reference ID:** `suwacakbxjusovhgawyv`
- **Region:** South Asia (Mumbai) — `ap-south-1`
- **Dashboard:** https://supabase.com/dashboard/project/suwacakbxjusovhgawyv

### 2. Database Schema (51 Tables)
10 Mongoose models with deeply nested subdocument arrays were normalized into 51 PostgreSQL tables with proper foreign keys, indexes, and constraints.

**Migration file:** `supabase/migrations/001_initial_schema.sql`

| Category | Tables |
|----------|--------|
| **Core** | `users`, `tokens`, `roles`, `role_privileges` |
| **Billing** | `subscriptions`, `user_subscriptions`, `credit_cards` |
| **Projects** | `projects`, `project_members` |
| **Standalone Chats** | `chats`, `messages` |
| **Assessments** | `assessments`, `assessment_messages` |
| **Workspace Assessments** | `workspace_assessments`, `assessment_reports`, `assessment_qa` |
| **Feedback** | `feedback`, `feedback_categories`, `feedback_subcategories` |
| **Workspaces** | `workspaces`, `folders` |
| **Folder Chats** | `folder_chats`, `folder_chat_messages`, `chat_message_reactions`, `folder_chat_comments`, `folder_chat_comment_replies`, `folder_chat_bookmarks`, `folder_chat_shared_users`, `folder_chat_media`, `folder_chat_documents`, `folder_chat_links`, `folder_chat_tasks`, `folder_chat_versions`, `folder_chat_version_users` |
| **Folder Assessments** | `folder_assessments`, `folder_assessment_reports`, `folder_assessment_sub_reports`, `folder_assessment_sub_report_qa`, `folder_assessment_shared_users`, `folder_assessment_media`, `folder_assessment_tasks`, `folder_assessment_documents`, `folder_assessment_links`, `folder_assessment_versions` |
| **Digital Playbooks** | `digital_playbooks`, `playbook_stages`, `playbook_nodes`, `playbook_stage_node_data`, `playbook_comments`, `playbook_comment_replies` |
| **Wireframes** | `folder_wireframes`, `folder_wireframe_entities`, `folder_wireframe_elements`, `folder_wireframe_shapes`, `folder_wireframe_comments` |
| **Misc** | `folder_business_info`, `folder_survey_info`, `folder_sitemap_references`, `user_shared_chats` |

### 3. All 12 Service Files Rewritten (4,882 lines)

| Service | Lines | Complexity | Status |
|---------|-------|------------|--------|
| `Feedback/service.js` | 40 | Low | ✅ |
| `Projects/service.js` | 13 | Low | ✅ |
| `role/service.js` | 78 | Low | ✅ |
| `tokens/service.js` | 136 | Low | ✅ |
| `users/service.js` | 271 | Medium | ✅ |
| `CreditCards/service.js` | 111 | Medium | ✅ |
| `Subscription/service.js` | 215 | Medium | ✅ |
| `Chats/service.js` | 211 | Medium | ✅ |
| `Assessments/service.js` | 307 | Medium-High | ✅ |
| `WorkspaceAssessments/service.js` | 274 | Medium-High | ✅ |
| `digitalPlaybook/service.js` | 484 | High | ✅ |
| `workSpaces/service.js` | 2,742 | Critical | ✅ |

### 4. Infrastructure Changes

| File | Change |
|------|--------|
| `package.json` | Removed `mongoose`, `mongodb`, `express-mongo-sanitize`. Added `@supabase/supabase-js`. Pinned Node to `18.x`. Changed start script from `pm2` to `node`. Removed husky prepare. |
| `src/config/config.js` | Replaced `MONGODB_URL` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Removed mongoose config block. |
| `src/config/supabase.js` | **New.** Supabase client singleton using service role key. |
| `src/config/passport.js` | Google OAuth now conditional — skips if `GOOGLE_CLIENT_ID` not set. |
| `src/server/index.js` | Replaced `mongoose.connect()` with Supabase health check query. |
| `src/server/app.js` | Removed `express-mongo-sanitize` middleware (not needed with PostgreSQL). |
| `src/middlewares/error.js` | Removed `mongoose.Error` check. |
| `src/utils/paginate.js` | **New.** Replaces `mongoose-paginate-v2` plugin with Supabase-compatible pagination. |
| `src/module/users/controller.js` | Replaced one direct `User.findByIdAndUpdate` call with Supabase query. |

### 5. Key Migration Patterns Applied

| Mongoose Pattern | Supabase Replacement |
|------------------|---------------------|
| `Model.create(data)` | `supabase.from(table).insert(data).select().single()` |
| `Model.findById(id)` | `supabase.from(table).select().eq('id', id).single()` |
| `Model.findOne(filter)` | `supabase.from(table).select().eq(key, val).single()` |
| `Model.paginate(filter, opts)` | `paginate(table, { filter, ...opts }, supabase)` |
| `$push` to subdocument array | `INSERT` into child table |
| `$pull` from subdocument array | `DELETE` from child table |
| `$set` with arrayFilters | `UPDATE` on child table directly |
| `.id()` subdocument lookup | `SELECT` from child table by ID |
| `.populate('field')` | Supabase FK join: `.select('*, user:users(*)')` |
| `user.isPasswordMatch()` | `bcrypt.compare()` in service layer |
| `User.isEmailTaken()` | `SELECT` check before insert |
| `mongoose.Error` handling | Standard error handling |

---

## What's NOT Done Yet

### Env Vars on Render (Required for Deploy)
Set these on Render dashboard → `cmp-backend` → Environment:

```
SUPABASE_URL=https://suwacakbxjusovhgawyv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1d2FjYWtieGp1c292aGdhd3l2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY2OTA0NiwiZXhwIjoyMDkxMjQ1MDQ2fQ.d96YzAby-e0f4-IrR4fpDvQ6MOh1S2DkL90l-eoAP7Q
```

### Optional Env Vars (Features disabled without them)
```
JWT_SECRET=<generate a strong secret>
STRIPE_KEY=<stripe publishable key>
STRIPE_SECRET_KEY=<stripe secret key>
STRIPE_WEBHOOK_SECRET=<stripe webhook secret>
SENDGRID_TOKEN=<sendgrid api key>
SENDGRID_EMAIL_FROM=<sender email>
NODE_MAILER_EMAIL=<email>
NODE_MAILER_PASSWORD=<password>
GOOGLE_CLIENT_ID=<google oauth client id>
GOOGLE_CLIENT_SECRET=<google oauth secret>
BASE_URL=<AI service URL for GPT proxy calls>
```

### Data Migration
- No existing MongoDB data has been migrated to Supabase
- Tables are empty — ready for fresh use or manual data import
- If there's existing production data in MongoDB, a migration script would be needed

### Testing
- Services compile but have not been runtime-tested end-to-end
- Some edge cases in the 2742-line workSpaces service may need debugging
- AI proxy calls (to `BASE_URL`) need the AI service URL configured

---

## Deployment Summary

| Component | URL | Status |
|-----------|-----|--------|
| **Frontend** | https://cmp-frontend-gamma.vercel.app | ✅ Live |
| **Backend** | https://cmp-backend-830s.onrender.com | ⏳ Needs env vars |
| **AI Service** | https://github.com/temurkhan13/cmp-ai | ✅ Repo ready |
| **Database** | Supabase `suwacakbxjusovhgawyv` | ✅ Schema deployed |

---

## Git History

```
23dbde2 feat: Complete MongoDB to Supabase migration
f6f5e6f fix: Make env vars optional except MONGODB_URL, skip Google OAuth
a3d9d02 fix: Pin Node.js to 18.x — SlowBuffer removed in Node 25
020c41e fix: Remove husky prepare script and pm2 start for Render
aa6093a (original) keep-coders codebase
```
