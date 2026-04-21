const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  Footer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} = require("docx");
const MarkdownIt = require("markdown-it");

const md = new MarkdownIt();

// ── Brand constants ─────────────────────────────────────────────
const COLOR = {
  primary: "00316F",
  accent: "C3E11D",
  textDark: "212121",
  textMedium: "555555",
  textLight: "888888",
  border: "DCDCDC",
};

const FONT = "Calibri";
const TEXT_SIZE = 21; // half-points → 10.5pt

/**
 * Sanitize text: strip non-Latin-1 chars (emoji) + decode HTML entities.
 */
const clean = (text) => {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[^\x00-\xFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Parse an HTML string (from markdown-it) into an array of DOCX Paragraphs.
 * Handles: headings, paragraphs with bold/italic, bullet lists, ordered lists, tables, blockquotes, hr.
 */
const htmlToDocxParagraphs = (html) => {
  const paragraphs = [];
  const lines = html.split("\n");

  // Legacy state (kept for readability; bullet paragraphs are created immediately)
  let _inUl = false;
  let inOl = false;
  let olIndex = 0;
  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];
  let inBlockquote = false;
  let blockquoteText = [];

  const flushBlockquote = () => {
    if (blockquoteText.length === 0) return;
    const text = blockquoteText.join(" ").trim();
    if (text) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: clean(text),
              italics: true,
              font: FONT,
              size: TEXT_SIZE,
              color: COLOR.textMedium,
            }),
          ],
          spacing: { before: 100, after: 100 },
          indent: { left: 400 },
          border: { left: { style: BorderStyle.SINGLE, size: 6, color: COLOR.accent, space: 8 } },
        })
      );
    }
    blockquoteText = [];
  };

  const flushTable = () => {
    if (tableHeaders.length === 0 && tableRows.length === 0) return;
    try {
      const colCount = tableHeaders.length || (tableRows[0] ? tableRows[0].length : 0);
      if (colCount === 0) return;

      const headerRow =
        tableHeaders.length > 0
          ? new TableRow({
              tableHeader: true,
              children: tableHeaders.map(
                (h) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: clean(h),
                            bold: true,
                            font: FONT,
                            size: 18,
                            color: "FFFFFF",
                          }),
                        ],
                        spacing: { before: 40, after: 40 },
                      }),
                    ],
                    shading: { type: ShadingType.SOLID, color: COLOR.primary },
                    width: { size: Math.floor(9000 / colCount), type: WidthType.DXA },
                  })
              ),
            })
          : null;

      const dataRowObjs = tableRows.map(
        (row, idx) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: clean(cell),
                          font: FONT,
                          size: 18,
                          color: COLOR.textDark,
                        }),
                      ],
                      spacing: { before: 30, after: 30 },
                    }),
                  ],
                  shading: idx % 2 === 0 ? { type: ShadingType.SOLID, color: "F5F7FA" } : undefined,
                  width: { size: Math.floor(9000 / colCount), type: WidthType.DXA },
                })
            ),
          })
      );

      const rows = headerRow ? [headerRow, ...dataRowObjs] : dataRowObjs;
      if (rows.length > 0) {
        paragraphs.push(
          new Table({
            rows,
            width: { size: 9000, type: WidthType.DXA },
          })
        );
        paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
      }
    } catch {
      // Fallback: render as text if table construction fails
      const allRows = [tableHeaders, ...tableRows].filter((r) => r.length > 0);
      for (const row of allRows) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: row.map(clean).join("  |  "),
                font: FONT,
                size: TEXT_SIZE,
                color: COLOR.textDark,
              }),
            ],
            spacing: { after: 40 },
          })
        );
      }
    }
    tableHeaders = [];
    tableRows = [];
  };

  /**
   * Parse inline HTML into TextRuns: handles <strong>, <em>, nested tags, plain text.
   */
  const parseInlineToRuns = (html) => {
    if (!html) return [new TextRun({ text: "", font: FONT, size: TEXT_SIZE })];
    const runs = [];
    // Split on tags, preserving tags
    const parts = html.split(/(<\/?(?:strong|b|em|i|code|a)[^>]*>)/gi);
    let bold = false;
    let italic = false;
    let mono = false;

    for (const part of parts) {
      if (!part) continue;
      const lower = part.toLowerCase();
      if (lower === "<strong>" || lower === "<b>") {
        bold = true;
        continue;
      }
      if (lower === "</strong>" || lower === "</b>") {
        bold = false;
        continue;
      }
      if (lower === "<em>" || lower === "<i>") {
        italic = true;
        continue;
      }
      if (lower === "</em>" || lower === "</i>") {
        italic = false;
        continue;
      }
      if (lower === "<code>") {
        mono = true;
        continue;
      }
      if (lower === "</code>") {
        mono = false;
        continue;
      }
      if (lower.startsWith("<a ") || lower === "</a>") continue; // skip link tags, keep text

      // Strip any remaining tags
      const text = clean(part.replace(/<[^>]*>/g, ""));
      if (!text) continue;

      runs.push(
        new TextRun({
          text,
          bold,
          italics: italic,
          font: mono ? "Courier New" : FONT,
          size: mono ? 19 : TEXT_SIZE,
          color: bold ? COLOR.textDark : italic ? COLOR.textMedium : COLOR.textDark,
        })
      );
    }

    return runs.length > 0 ? runs : [new TextRun({ text: "", font: FONT, size: TEXT_SIZE })];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // ── Blockquote ──
    if (line.startsWith("<blockquote>")) {
      inBlockquote = true;
      continue;
    }
    if (line.includes("</blockquote>")) {
      inBlockquote = false;
      flushBlockquote();
      continue;
    }
    if (inBlockquote) {
      const text = line.replace(/<\/?p>/g, "").replace(/<[^>]*>/g, "");
      if (text.trim()) blockquoteText.push(text.trim());
      continue;
    }

    // ── Table ──
    if (line.startsWith("<table>")) {
      inTable = true;
      tableHeaders = [];
      tableRows = [];
      continue;
    }
    if (line === "</table>") {
      inTable = false;
      flushTable();
      continue;
    }
    if (inTable) {
      if (line.includes("<th>")) {
        tableHeaders = line
          .replace(/<\/?tr>/g, "")
          .replace(/<\/?thead>/g, "")
          .split(/<\/?th>/)
          .filter((s) => s.trim() && !s.startsWith("<"))
          .map((s) => s.replace(/<[^>]*>/g, "").trim());
      } else if (line.includes("<td>")) {
        const cells = line
          .replace(/<\/?tr>/g, "")
          .replace(/<\/?tbody>/g, "")
          .split(/<\/?td>/)
          .filter((s) => s.trim() && !s.startsWith("<"))
          .map((s) => s.replace(/<[^>]*>/g, "").trim());
        if (cells.length) tableRows.push(cells);
      }
      continue;
    }

    // ── Lists ──
    if (line === "<ul>") {
      _inUl = true;
      continue;
    }
    if (line === "</ul>") {
      _inUl = false;
      continue;
    }
    if (line === "<ol>") {
      inOl = true;
      olIndex = 0;
      continue;
    }
    if (line === "</ol>") {
      inOl = false;
      continue;
    }
    if (line.startsWith("<li>")) {
      const inner = line.replace(/<\/?li>/g, "");
      const runs = parseInlineToRuns(inner);
      if (inOl) {
        olIndex++;
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${olIndex}. `,
                bold: true,
                font: FONT,
                size: TEXT_SIZE,
                color: COLOR.primary,
              }),
              ...runs,
            ],
            spacing: { after: 60 },
            indent: { left: 500 },
          })
        );
      } else {
        paragraphs.push(
          new Paragraph({
            children: runs,
            bullet: { level: 0 },
            spacing: { after: 60 },
          })
        );
      }
      continue;
    }

    // ── Headings ──
    if (line.match(/^<h1[> ]/)) {
      const text = clean(line.replace(/<\/?h1[^>]*>/g, ""));
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text, bold: true, font: FONT, size: 52, color: COLOR.primary })],
          spacing: { before: 400, after: 200 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: COLOR.border, space: 4 } },
        })
      );
      continue;
    }
    if (line.match(/^<h2[> ]/)) {
      const text = clean(line.replace(/<\/?h2[^>]*>/g, ""));
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text, bold: true, font: FONT, size: 36, color: COLOR.primary })],
          spacing: { before: 360, after: 160 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: COLOR.border, space: 4 } },
        })
      );
      continue;
    }
    if (line.match(/^<h3[> ]/)) {
      const text = clean(line.replace(/<\/?h3[^>]*>/g, ""));
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text, bold: true, font: FONT, size: 28, color: COLOR.textDark }),
          ],
          spacing: { before: 300, after: 120 },
        })
      );
      continue;
    }
    if (line.match(/^<h[4-6][> ]/)) {
      const text = clean(line.replace(/<\/?h[4-6][^>]*>/g, ""));
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text, bold: true, font: FONT, size: 24, color: COLOR.textMedium }),
          ],
          spacing: { before: 240, after: 100 },
        })
      );
      continue;
    }

    // ── Horizontal rule ──
    if (line === "<hr>" || line === "<hr/>") {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: "", size: 2 })],
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: COLOR.border, space: 6 } },
          spacing: { before: 120, after: 120 },
        })
      );
      continue;
    }

    // ── Paragraphs ──
    if (line.startsWith("<p>") || line.startsWith("<p ")) {
      const inner = line.replace(/<\/?p[^>]*>/g, "");
      const runs = parseInlineToRuns(inner);
      paragraphs.push(
        new Paragraph({
          children: runs,
          spacing: { after: 120, line: 276 },
        })
      );
      continue;
    }

    // ── Skip structural/close tags ──
    if (
      line.match(
        /^<\/?(div|section|article|header|footer|nav|aside|main|figure|figcaption|pre|code)/
      )
    )
      continue;
    if (line.match(/^<\/?(ul|ol|li|table|thead|tbody|tr|th|td|blockquote)/)) continue;

    // ── Fallback: render as text paragraph ──
    const text = clean(line.replace(/<[^>]*>/g, ""));
    if (text) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text, font: FONT, size: TEXT_SIZE, color: COLOR.textDark })],
          spacing: { after: 80 },
        })
      );
    }
  }

  return paragraphs;
};

/**
 * Build the cover page section.
 */
const buildCoverPage = (normalized) => {
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    children: [
      new Paragraph({ spacing: { before: 3000 } }),
      new Paragraph({
        children: [
          new TextRun({
            text:
              normalized.metadata?.source === "playbook" ? "DIGITAL PLAYBOOK" : "ASSESSMENT REPORT",
            font: FONT,
            size: 22,
            color: COLOR.textLight,
            characterSpacing: 200,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: clean(normalized.title),
            bold: true,
            font: FONT,
            size: 56,
            color: COLOR.primary,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "", size: 2 })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR.accent, space: 1 } },
        indent: { left: 3200, right: 3200 },
        spacing: { after: 300 },
      }),
      new Paragraph({
        children: [new TextRun({ text: dateStr, font: FONT, size: 20, color: COLOR.textLight })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      ...(normalized.metadata?.workspaceName
        ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: normalized.metadata.workspaceName,
                  font: FONT,
                  size: 20,
                  color: COLOR.textMedium,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ]
        : []),
      new Paragraph({ spacing: { before: 2000 } }),
      new Paragraph({
        children: [
          new TextRun({
            text: "Generated by ChangeAI",
            font: FONT,
            size: 18,
            color: COLOR.textLight,
            italics: true,
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
  };
};

/**
 * Generate a DOCX Buffer from normalized export data.
 * Uses markdown-it to parse the raw markdown → HTML → DOCX paragraphs.
 */
const generate = async (normalized) => {
  // Render markdown through markdown-it (same as PDF generator)
  const html = md.render(normalized.markdown || "");
  const contentChildren = htmlToDocxParagraphs(html);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: TEXT_SIZE, color: COLOR.textDark },
        },
      },
    },
    sections: [
      // Cover page
      buildCoverPage(normalized),
      // Content
      {
        properties: {
          page: {
            margin: { top: 1200, bottom: 1200, left: 1100, right: 1100 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Generated by ChangeAI",
                    font: FONT,
                    size: 16,
                    color: COLOR.textLight,
                    italics: true,
                  }),
                ],
                alignment: AlignmentType.CENTER,
                border: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: COLOR.border, space: 4 },
                },
              }),
            ],
          }),
        },
        children: contentChildren,
      },
    ],
  });

  return Packer.toBuffer(doc);
};

module.exports = generate;
