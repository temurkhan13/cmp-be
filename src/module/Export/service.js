const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const FNS = require("date-fns");
const workspaceAssessmentService = require("../WorkspaceAssessments/service");
const playbookService = require("../digitalPlaybook/service");
const generators = require("./generators");

const FILE_EXTENSIONS = { pdf: "pdf", docx: "docx", xlsx: "xlsx", pptx: "pptx" };

/**
 * Generate a safe filename from a title and extension.
 */
const generateSafeFilename = (title, extension) => {
  const timestamp = FNS.format(new Date(), "yyyyMMdd-HHmmss");
  const safeTitle = (title || "export")
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .substring(0, 60);
  return `${safeTitle}-${timestamp}.${extension}`;
};

/**
 * Strip ALL characters outside Latin-1 (U+00FF) — catches every emoji in one sweep.
 * DOCX/PPTX/XLSX handle Unicode better than PDF's Helvetica, but emoji
 * still render as garbled boxes in most document fonts, so strip them.
 */
const sanitizeEmoji = (text) => {
  if (!text) return "";
  return text
    .replace(/[^\x00-\xFF]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

/**
 * Clean raw markdown content for non-PDF generators (DOCX, PPTX, XLSX).
 * Converts markdown syntax to clean structured text:
 * - Tables → "col1  —  col2  —  col3" rows
 * - Horizontal rules → removed
 * - Escaped chars (1\.) → unescaped (1.)
 * - Standalone asterisks → removed
 * - Preserves **bold**, *italic*, - bullets, numbered lists for downstream parsing
 */
const cleanMarkdownContent = (text) => {
  if (!text) return "";
  const lines = text.split("\n");
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip horizontal rules (---, ***, ___)
    if (/^[-*_]{3,}\s*$/.test(trimmed)) continue;

    // Skip table separator rows |---|---|
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;

    // Convert table data rows: | col1 | col2 | → "col1  —  col2"
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed
        .split("|")
        .filter(Boolean)
        .map((c) => c.trim());
      if (cells.length > 0) result.push(cells.join("  —  "));
      continue;
    }

    // Skip standalone asterisks or bullets with no content (* or - alone)
    if (/^[*\-+]\s*$/.test(trimmed)) continue;

    // Unescape markdown backslash escapes (1\. → 1.)
    let cleaned = trimmed.replace(/\\([.!#\-*_`~[\](){}+|>])/g, "$1");

    // Decode HTML entities
    cleaned = cleaned
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");

    if (cleaned) result.push(cleaned);
  }
  return result.join("\n");
};

/**
 * Parse markdown lines into a properly nested section tree.
 * H1 sections contain H2 children, H2 sections contain H3 children, etc.
 */
const parseMarkdownSections = (markdown) => {
  const lines = markdown.split("\n");
  const roots = [];
  // Stack tracks current nesting path: [level1Section, level2Section, ...]
  const stack = [];

  let contentBuffer = [];

  const flushContent = () => {
    const text = contentBuffer.join("\n").trim();
    contentBuffer = [];
    if (!text) return;
    // Attach to deepest section in stack, or create a root intro section
    if (stack.length > 0) {
      const parent = stack[stack.length - 1];
      parent.content += (parent.content ? "\n\n" : "") + text;
    } else {
      roots.push({ heading: "", level: 0, content: text, children: [] });
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushContent();
      const level = headingMatch[1].length;
      const section = {
        heading: headingMatch[2].trim(),
        level,
        content: "",
        children: [],
      };

      // Pop stack until we find a parent with a lower level
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(section);
      } else {
        roots.push(section);
      }
      stack.push(section);
    } else {
      contentBuffer.push(line);
    }
  }
  flushContent();

  return roots;
};

/**
 * Normalize assessment data into a common export shape.
 * Assessment reports store content as markdown, so sections are parsed from headings.
 */
const normalizeAssessment = (assessment, options) => {
  const report = assessment.report;
  if (!report || !report.content) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Assessment has no report content to export");
  }

  const title = options?.title || assessment.name || report.title || "Assessment Report";
  const markdown = report.content;
  const sections = parseMarkdownSections(markdown);

  // Sanitize all section text (emoji + markdown cleanup for non-PDF generators)
  const sanitizeSections = (secs) => {
    for (const sec of secs) {
      sec.heading = sanitizeEmoji(sec.heading);
      sec.content = sanitizeEmoji(cleanMarkdownContent(sec.content));
      if (sec.children) sanitizeSections(sec.children);
    }
  };
  sanitizeSections(sections);

  return {
    title: sanitizeEmoji(title),
    markdown,
    metadata: {
      source: "assessment",
      sourceId: assessment.id,
      generatedAt: report.generated_at || new Date(),
    },
    branding: options?.branding || {},
    sections,
  };
};

/**
 * Convert HTML description to plain text, preserving line breaks for paragraphs.
 */
const htmlToPlainText = (html) => {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/**
 * Normalize playbook data into a common export shape.
 */
const normalizePlaybook = (playbook, options) => {
  const title = options?.title || playbook.name || "Digital Playbook";
  const sections = [];

  for (const stage of playbook.stages || []) {
    const section = {
      heading: stage.stage || "",
      level: 1,
      content: "",
      children: [],
    };

    // Stage-level nodeData
    for (const nd of stage.nodeData || []) {
      section.children.push({
        heading: nd.heading || "",
        level: 2,
        content: htmlToPlainText(nd.description || ""),
        htmlContent: nd.description || "",
        children: [],
      });
    }

    // Nodes within stage
    for (const node of stage.nodes || []) {
      const nodeChild = {
        heading: node.heading || "",
        level: 2,
        content: "",
        children: [],
      };

      for (const nd of node.nodeData || []) {
        nodeChild.children.push({
          heading: nd.heading || "",
          level: 3,
          content: htmlToPlainText(nd.description || ""),
          htmlContent: nd.description || "",
          children: [],
        });
      }

      section.children.push(nodeChild);
    }

    sections.push(section);
  }

  // Build markdown representation for the PDF generator
  const markdownLines = [`# ${title}`, ""];
  for (const section of sections) {
    markdownLines.push(`## ${section.heading}`, "");
    for (const child of section.children) {
      if (child.heading) markdownLines.push(`### ${child.heading}`, "");
      if (child.content) markdownLines.push(child.content, "");
      for (const grandchild of child.children) {
        if (grandchild.heading) markdownLines.push(`#### ${grandchild.heading}`, "");
        if (grandchild.content) markdownLines.push(grandchild.content, "");
      }
    }
  }

  // Sanitize all section text
  const sanitizeSections = (secs) => {
    for (const sec of secs) {
      sec.heading = sanitizeEmoji(sec.heading);
      sec.content = sanitizeEmoji(sec.content);
      if (sec.children) sanitizeSections(sec.children);
    }
  };
  sanitizeSections(sections);

  return {
    title: sanitizeEmoji(title),
    markdown: markdownLines.join("\n"),
    metadata: {
      source: "playbook",
      sourceId: playbook.id,
      workspaceName: playbook.workspace_name || "",
      generatedAt: new Date(),
    },
    branding: options?.branding || {},
    sections,
  };
};

/**
 * Fetch source data and normalize it.
 */
const fetchAndNormalize = async (source, sourceId, options) => {
  switch (source) {
    case "assessment": {
      const assessment = await workspaceAssessmentService.getWorkspaceAssessmentById(sourceId);
      if (!assessment) {
        throw new ApiError(httpStatus.NOT_FOUND, "Assessment not found");
      }
      return normalizeAssessment(assessment, options);
    }
    case "playbook": {
      const playbook = await playbookService.getSitemap(sourceId);
      if (!playbook) {
        throw new ApiError(httpStatus.NOT_FOUND, "Playbook not found");
      }
      return normalizePlaybook(playbook, options);
    }
    default:
      throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported source: ${source}`);
  }
};

/**
 * Main export generation function.
 */
const generate = async ({ type, source, sourceId, options }) => {
  const normalized = await fetchAndNormalize(source, sourceId, options);
  const generator = generators[type];
  if (!generator) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported export type: ${type}`);
  }

  const buffer = await generator(normalized);
  const fileName = generateSafeFilename(normalized.title, FILE_EXTENSIONS[type]);

  return { buffer, fileName };
};

module.exports = { generate };
