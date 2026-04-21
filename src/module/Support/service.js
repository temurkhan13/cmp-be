const logger = require("../../config/logger");
const { sendSupportNotification } = require("../../utils/emailService");

const _PLATFORM_KNOWLEDGE = `
You are the ChangeAI Support Assistant. You help users with questions about the ChangeAI platform.
Be friendly, concise, and helpful. If you don't know something, say so honestly.

## Platform Overview
ChangeAI is an AI-powered change management platform by InnovationWorks. It helps organisations plan, assess, and execute change initiatives using AI.

## Features

### Dashboard
- Central hub showing Quick Stats: total Workspaces, Projects, Assessments, AI Assistants, Digital Playbooks
- Workspace management: create, switch, delete workspaces
- Recent activity: quick access to recent chats and assessments
- Folder/project system inside workspaces to organise work

### AI Assistant
- AI-powered chatbot for change management support
- Upload documents (PDF) for contextual analysis
- Quick actions: Change Tone, Translate, Improve Writing, Fix Grammar, Make Shorter/Longer, Simplify, Summarize, Explain
- Chat history with search and bookmarks
- Works within workspace/folder context

### Assessments (24 types)
- ADKAR Assessment, Stakeholder Analysis, Change Readiness, Risk Assessment, Communication Plan, Training Needs Analysis, and 18 more
- AI guides through questions, then generates comprehensive reports
- Reports can be edited in a rich text editor
- Export to PDF, Word, PPT, Excel (paid plans)
- Version history: save and restore previous versions of reports

### Digital Playbook
- Sitemap Generator: AI creates visual sitemaps from your description
- Wireframe Playground: drag-and-drop builder for layouts
- Export as PDF

### Knowledge Base
- Upload your organisation's documents
- AI uses them for contextual, personalised advice (RAG)
- Supports PDF uploads

### Plan & Billing
- Starter (Free): 1 workspace, 1 project, 3 assessments/month, 10K AI words
- Professional (£49/month): 5 workspaces, 10 projects, unlimited assessments, 100K AI words, all export formats
- Enterprise (£199/month): unlimited everything, custom AI training, SSO, dedicated support

### Settings
- Profile management, password change
- Email verification

### Keyboard Shortcuts
- Ctrl+K: Command palette for quick navigation

## Common Questions

Q: How do I create a new assessment?
A: Go to My Assessments in the sidebar, click "New Assessment", choose from 24 assessment types, and the AI will guide you through questions to generate a report.

Q: How do I upload documents for the AI?
A: In the AI Assistant chat, you can upload PDF documents. They'll be analysed and used for contextual responses. For permanent knowledge, use the Knowledge Base section.

Q: What's the difference between workspaces and projects?
A: Workspaces are top-level containers. Each workspace contains projects (folders). Projects contain your chats, assessments, sitemaps, and wireframes.

Q: How do I export my report?
A: Open the assessment report in the editor, then use the export button. Free plans support PDF only. Professional and Enterprise plans support PDF, Word, PPT, and Excel.

Q: How do I upgrade my plan?
A: Go to Plan & Billing in the sidebar to see available plans and upgrade.

Q: I forgot my password, what do I do?
A: On the login page, click "Forgot Password". Enter your email and you'll receive a verification code to reset your password.

Q: Can I collaborate with team members?
A: Yes, you can invite team members to workspaces. They'll receive an email invitation to join.
`;

const handleSupportChat = async (message, history, user) => {
  // Build conversation for a simple rule-based + keyword response
  const lowerMsg = message.toLowerCase();

  // Try to find an answer from platform knowledge
  const reply = generateResponse(lowerMsg, message);

  // Send email notification to admin (non-blocking)
  try {
    const userName = user.first_name
      ? `${user.first_name} ${user.last_name || ""}`.trim()
      : user.email;
    await sendSupportNotification(user.email, userName, message, reply);
  } catch (err) {
    logger.error("Failed to send support notification email:", err.message);
  }

  return reply;
};

const generateResponse = (lowerMsg, _originalMsg) => {
  // Assessment related
  if (lowerMsg.includes("assessment") || lowerMsg.includes("report")) {
    if (lowerMsg.includes("create") || lowerMsg.includes("new") || lowerMsg.includes("start")) {
      return "To create a new assessment, go to **My Assessments** in the sidebar and click **New Assessment**. You can choose from 24 assessment types including ADKAR, Stakeholder Analysis, Change Readiness, and more. The AI will guide you through a series of questions and generate a comprehensive report.";
    }
    if (
      lowerMsg.includes("export") ||
      lowerMsg.includes("download") ||
      lowerMsg.includes("pdf") ||
      lowerMsg.includes("word")
    ) {
      return "To export your report, open it in the editor and click the **Export** button. The Starter plan supports PDF export. Professional and Enterprise plans unlock Word, PowerPoint, and Excel formats as well.";
    }
    if (
      lowerMsg.includes("version") ||
      lowerMsg.includes("restore") ||
      lowerMsg.includes("history")
    ) {
      return "ChangeAI saves version history of your assessment reports. Click the **Version History** button in the assessment view to see previous versions. You can restore any saved version. Starter plans allow 2 versions per assessment, Professional allows 10, and Enterprise is unlimited.";
    }
    if (lowerMsg.includes("type") || lowerMsg.includes("how many") || lowerMsg.includes("which")) {
      return "ChangeAI offers **24 assessment types** including: ADKAR Assessment, Stakeholder Analysis, Change Readiness Assessment, Risk Assessment, Communication Plan, Training Needs Analysis, Impact Assessment, and many more. Each assessment type has a guided questionnaire tailored to that specific analysis.";
    }
    return "The **Assessments** module lets you create AI-powered change management reports. Choose from 24 types, answer guided questions, and get a comprehensive report you can edit and export. Go to **My Assessments** in the sidebar to get started. What specifically would you like to know?";
  }

  // Workspace / project related
  if (
    lowerMsg.includes("workspace") ||
    lowerMsg.includes("project") ||
    lowerMsg.includes("folder")
  ) {
    if (lowerMsg.includes("create") || lowerMsg.includes("new") || lowerMsg.includes("add")) {
      return "To create a new workspace, go to the **Dashboard** and click **New Workspace**. Inside each workspace, you can create projects (folders) to organise your chats, assessments, and playbooks. Your plan determines how many workspaces and projects you can have.";
    }
    if (lowerMsg.includes("delete") || lowerMsg.includes("remove")) {
      return "To delete a workspace, hover over it on the Dashboard and click the three-dot menu, then select **Delete**. This moves it to Trash where you can restore it if needed.";
    }
    if (lowerMsg.includes("limit") || lowerMsg.includes("how many")) {
      return "Workspace limits depend on your plan:\n- **Starter (Free):** 1 workspace, 1 project\n- **Professional (£49/mo):** 5 workspaces, 10 projects\n- **Enterprise (£199/mo):** Unlimited workspaces and projects";
    }
    return "**Workspaces** are your top-level containers for organising work. Each workspace contains **projects (folders)**, and each project contains your chats, assessments, sitemaps, and wireframes. You can switch between workspaces from the Dashboard.";
  }

  // AI Assistant related
  if (lowerMsg.includes("assistant") || lowerMsg.includes("chat") || lowerMsg.includes("ai ")) {
    if (lowerMsg.includes("upload") || lowerMsg.includes("document") || lowerMsg.includes("pdf")) {
      return "In the **AI Assistant**, you can upload PDF documents directly in the chat. The AI will analyse them and use the content to give you contextual advice. For permanent document storage, use the **Knowledge Base** section.";
    }
    if (
      lowerMsg.includes("tone") ||
      lowerMsg.includes("translate") ||
      lowerMsg.includes("grammar") ||
      lowerMsg.includes("writing")
    ) {
      return "The AI Assistant has several **Quick Actions** you can use on any text:\n- **Change Tone** — adjust for different audiences\n- **Translate** — convert to other languages\n- **Improve Writing** — enhance clarity and style\n- **Fix Grammar** — correct grammatical errors\n- **Make Shorter/Longer** — adjust length\n- **Simplify** — make language more accessible\n- **Summarize** — get key points";
    }
    return "The **AI Assistant** is your AI-powered chatbot for change management support. You can ask questions, upload documents for analysis, and use quick actions like Change Tone, Translate, and Summarize. Access it from **AI Assistant** in the sidebar.";
  }

  // Plan / billing / pricing related
  if (
    lowerMsg.includes("plan") ||
    lowerMsg.includes("billing") ||
    lowerMsg.includes("price") ||
    lowerMsg.includes("pricing") ||
    lowerMsg.includes("subscription") ||
    lowerMsg.includes("upgrade") ||
    lowerMsg.includes("cost")
  ) {
    return "ChangeAI offers three plans:\n\n**Starter (Free):** 1 workspace, 1 project, 3 assessments/month, PDF export, 10K AI words\n\n**Professional (£49/month):** 5 workspaces, 10 projects, unlimited assessments, all export formats (PDF, Word, PPT, Excel), RAG document upload, 100K AI words\n\n**Enterprise (£199/month):** Unlimited everything, custom AI training, SSO & team management, dedicated support\n\nGo to **Plan & Billing** in the sidebar to upgrade.";
  }

  // Knowledge base
  if (
    lowerMsg.includes("knowledge") ||
    lowerMsg.includes("rag") ||
    lowerMsg.includes("upload") ||
    lowerMsg.includes("document")
  ) {
    return "The **Knowledge Base** lets you upload your organisation's documents (PDFs). The AI uses these documents to give you personalised, context-aware advice through RAG (Retrieval-Augmented Generation). Access it from **Knowledge Base** in the sidebar.";
  }

  // Playbook / sitemap / wireframe
  if (
    lowerMsg.includes("playbook") ||
    lowerMsg.includes("sitemap") ||
    lowerMsg.includes("wireframe")
  ) {
    return "The **Digital Playbook** has two modules:\n\n**Sitemap Generator:** Describe your project and the AI creates a visual sitemap that you can modify.\n\n**Wireframe Playground:** A drag-and-drop builder where you can add text, images, graphs, and tables to design layouts.\n\nBoth can be exported as PDF. Access from **Sitemap** or **Digital Playbook** in the sidebar.";
  }

  // Password / account
  if (lowerMsg.includes("password") || lowerMsg.includes("forgot") || lowerMsg.includes("reset")) {
    return "To reset your password:\n1. Go to the login page\n2. Click **Forgot Password**\n3. Enter your email address\n4. You'll receive a verification code\n5. Enter the code and set your new password\n\nIf you're already logged in, you can change your password in **Settings**.";
  }

  // Verification / email
  if (lowerMsg.includes("verif") || lowerMsg.includes("email") || lowerMsg.includes("code")) {
    return "After signing up, you'll receive a **verification code** via email. Enter this code in the verification prompt to activate your account. If you didn't receive it, click **Resend Code**. Check your spam folder if it doesn't appear in your inbox.";
  }

  // Keyboard / shortcuts
  if (
    lowerMsg.includes("shortcut") ||
    lowerMsg.includes("ctrl") ||
    lowerMsg.includes("keyboard") ||
    lowerMsg.includes("command palette")
  ) {
    return "Press **Ctrl+K** (or Cmd+K on Mac) to open the **Command Palette**. This lets you quickly search and navigate to any page in the platform without using the sidebar.";
  }

  // Trash
  if (
    lowerMsg.includes("trash") ||
    lowerMsg.includes("deleted") ||
    lowerMsg.includes("recover") ||
    lowerMsg.includes("restore")
  ) {
    return "Deleted items are moved to the **Trash** section (accessible from the sidebar). You can restore items from Trash if needed. Items in Trash are organised by type: Workspaces, Folders, Assessments, and AI Assistant chats.";
  }

  // Collaboration / team / invite
  if (
    lowerMsg.includes("team") ||
    lowerMsg.includes("collaborate") ||
    lowerMsg.includes("invite") ||
    lowerMsg.includes("share")
  ) {
    return "You can invite team members to collaborate by sharing workspace access. They'll receive an **email invitation** to join. Team management features are available on Professional and Enterprise plans.";
  }

  // Feedback
  if (
    lowerMsg.includes("feedback") ||
    lowerMsg.includes("suggestion") ||
    lowerMsg.includes("bug")
  ) {
    return "We value your feedback! Go to the **Feedback** section in the sidebar to submit your suggestions, report bugs, or share your experience. Our team reviews all feedback to improve ChangeAI.";
  }

  // Greeting
  if (
    lowerMsg.includes("hello") ||
    lowerMsg.includes("hi") ||
    lowerMsg.includes("hey") ||
    lowerMsg.includes("help")
  ) {
    return "Hello! I'm the ChangeAI Support Assistant. I can help you with:\n\n- **Getting started** with the platform\n- **Assessments** — creating and exporting reports\n- **AI Assistant** — chatting and uploading documents\n- **Plans & Billing** — pricing and upgrades\n- **Account** — passwords, verification, settings\n\nWhat would you like to know?";
  }

  // Thanks
  if (lowerMsg.includes("thank") || lowerMsg.includes("cheers") || lowerMsg.includes("great")) {
    return "You're welcome! If you have any other questions, feel free to ask. I'm here to help!";
  }

  // Default
  return "I'm not sure about that specific question. Here are some things I can help with:\n\n- **Assessments** — creating, editing, exporting reports\n- **AI Assistant** — using the chatbot and quick actions\n- **Workspaces & Projects** — organising your work\n- **Plans & Billing** — pricing and features\n- **Account** — passwords, verification, settings\n\nCould you rephrase your question, or would you like me to connect you with our support team?";
};

module.exports = { handleSupportChat };
