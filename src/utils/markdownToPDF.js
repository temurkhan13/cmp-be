const PDFDocument = require("pdfkit");
const MarkdownIt = require("markdown-it");

const md = new MarkdownIt();

// ── Brand constants ─────────────────────────────────────────────
const BRAND = {
	primary: [0, 49, 111],       // #00316F — dark navy
	accent: [195, 225, 29],      // #C3E11D — lime green
	textDark: [33, 33, 33],      // #212121
	textMedium: [85, 85, 85],    // #555555
	textLight: [136, 136, 136],  // #888888
	bgLight: [245, 247, 250],    // #F5F7FA — code/quote background
	border: [220, 220, 220],     // #DCDCDC
	white: [255, 255, 255],
	tableBorder: [200, 200, 200],
	tableHeaderBg: [0, 49, 111],
	tableStripeBg: [245, 247, 250],
};

const FONTS = {
	regular: "Helvetica",
	bold: "Helvetica-Bold",
	italic: "Helvetica-Oblique",
	boldItalic: "Helvetica-BoldOblique",
	mono: "Courier",
};

const PAGE = {
	marginTop: 60,
	marginBottom: 60,
	marginLeft: 55,
	marginRight: 55,
};

/**
 * Strip ALL characters outside Latin-1 (U+00FF) that Helvetica cannot render.
 * This catches every emoji, CJK char, symbol, etc. in one sweep.
 */
const sanitizeText = (text) => {
	if (!text) return "";
	return text
		// HTML entities FIRST (before stripping non-Latin chars)
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ")
		// Strip everything outside Latin-1 — Helvetica cannot render it
		.replace(/[^\x00-\xFF]/g, "")
		// Clean up leftover whitespace from removed chars
		.replace(/\s{2,}/g, " ");
};

/**
 * Strip HTML tags, decode entities, sanitize for Helvetica.
 */
const cleanInline = (html) => {
	if (!html) return "";
	return sanitizeText(
		html
			.replace(/<br\s*\/?>/g, " ")
			.replace(/<[^>]*>/g, "")
	).trim();
};

/**
 * Convert markdown to a professionally formatted PDF and return a Buffer.
 * @param {string} markdown
 * @param {object} [opts] - Optional: { title, coverPage }
 * @returns {Promise<Buffer>}
 */
const convertMarkdownToPDF = (markdown, opts = {}) => {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({
			margins: {
				top: PAGE.marginTop,
				bottom: PAGE.marginBottom,
				left: PAGE.marginLeft,
				right: PAGE.marginRight,
			},
			size: "A4",
			bufferPages: true,
			info: {
				Title: opts.title || "Export",
				Creator: "ChangeAI",
			},
		});

		const chunks = [];
		doc.on("data", (chunk) => chunks.push(chunk));
		doc.on("end", () => resolve(Buffer.concat(chunks)));
		doc.on("error", reject);

		const pageWidth = doc.page.width - PAGE.marginLeft - PAGE.marginRight;

		// ── Helper: Draw accent line ──
		const drawAccentLine = (y, width = 60) => {
			doc.save()
				.moveTo((doc.page.width - width) / 2, y)
				.lineTo((doc.page.width + width) / 2, y)
				.lineWidth(2.5)
				.strokeColor(BRAND.accent)
				.stroke()
				.restore();
		};

		// ── Helper: Draw section divider ──
		const drawDivider = () => {
			const y = doc.y + 6;
			doc.save()
				.moveTo(PAGE.marginLeft, y)
				.lineTo(doc.page.width - PAGE.marginRight, y)
				.lineWidth(0.5)
				.strokeColor(BRAND.border)
				.stroke()
				.restore();
			doc.y = y + 10;
		};

		// ── Helper: Check page space, add page if needed ──
		const ensureSpace = (needed) => {
			if (doc.y + needed > doc.page.height - PAGE.marginBottom - 20) {
				doc.addPage();
			}
		};

		// ── Cover Page (optional) ──
		if (opts.coverPage !== false) {
			const title = sanitizeText(opts.title || "Document Export");
			doc.fontSize(11)
				.font(FONTS.regular)
				.fillColor(BRAND.textLight)
				.text("POWERED BY", 0, 200, { align: "center", width: doc.page.width });

			doc.fontSize(14)
				.font(FONTS.bold)
				.fillColor(BRAND.primary)
				.text("ChangeAI", 0, 218, { align: "center", width: doc.page.width });

			drawAccentLine(250, 80);

			doc.fontSize(28)
				.font(FONTS.bold)
				.fillColor(BRAND.primary)
				.text(title, PAGE.marginLeft, 280, {
					align: "center",
					width: pageWidth,
					lineGap: 4,
				});

			const dateStr = new Date().toLocaleDateString("en-US", {
				year: "numeric", month: "long", day: "numeric",
			});
			doc.fontSize(10)
				.font(FONTS.regular)
				.fillColor(BRAND.textLight)
				.text(dateStr, 0, 360, { align: "center", width: doc.page.width });

			doc.addPage();
		}

		// ── Parse markdown to HTML lines ──
		const htmlContent = md.render(markdown);
		const lines = htmlContent.split("\n");

		let inCodeBlock = false;
		let codeLines = [];
		let inBlockquote = false;
		let blockquoteLines = [];
		let inTable = false;
		let tableHeaders = [];
		let tableRows = [];
		let orderedListIndex = 0;
		let inOrderedList = false;
		let listDepth = 0;

		const renderCodeBlock = () => {
			if (codeLines.length === 0) return;
			const code = codeLines.join("\n");
			const lineHeight = 13;
			const blockHeight = codeLines.length * lineHeight + 20;
			ensureSpace(blockHeight);

			const bgY = doc.y - 4;
			doc.save()
				.roundedRect(PAGE.marginLeft, bgY, pageWidth, blockHeight, 4)
				.fill(BRAND.bgLight);
			doc.restore();

			doc.font(FONTS.mono)
				.fontSize(9)
				.fillColor(BRAND.textDark)
				.text(code, PAGE.marginLeft + 12, bgY + 10, {
					width: pageWidth - 24,
					lineGap: 3,
				});

			doc.y = bgY + blockHeight + 8;
			codeLines = [];
		};

		const renderBlockquote = () => {
			if (blockquoteLines.length === 0) return;
			const text = blockquoteLines.join(" ").trim();
			const textHeight = doc.heightOfString(text, {
				width: pageWidth - 30,
				fontSize: 11,
			});
			const blockHeight = textHeight + 16;
			ensureSpace(blockHeight);

			const bgY = doc.y;
			doc.save()
				.rect(PAGE.marginLeft, bgY, 3, blockHeight)
				.fill(BRAND.accent);
			doc.restore();
			doc.save()
				.rect(PAGE.marginLeft + 3, bgY, pageWidth - 3, blockHeight)
				.fill(BRAND.bgLight);
			doc.restore();

			doc.font(FONTS.italic)
				.fontSize(11)
				.fillColor(BRAND.textMedium)
				.text(text, PAGE.marginLeft + 16, bgY + 8, { width: pageWidth - 30 });

			doc.y = bgY + blockHeight + 8;
			blockquoteLines = [];
		};

		const renderTable = () => {
			if (tableHeaders.length === 0) return;
			const colCount = tableHeaders.length;
			const colWidth = pageWidth / colCount;
			const cellPad = 6;
			const rowHeight = 22;

			ensureSpace((tableRows.length + 1) * rowHeight + 10);

			let y = doc.y;

			// Header row
			doc.save()
				.rect(PAGE.marginLeft, y, pageWidth, rowHeight)
				.fill(BRAND.tableHeaderBg);
			doc.restore();
			tableHeaders.forEach((header, i) => {
				doc.font(FONTS.bold)
					.fontSize(9)
					.fillColor(BRAND.white)
					.text(sanitizeText(header), PAGE.marginLeft + i * colWidth + cellPad, y + 6, {
						width: colWidth - cellPad * 2,
						align: "left",
					});
			});
			y += rowHeight;

			// Data rows
			tableRows.forEach((row, rowIdx) => {
				if (rowIdx % 2 === 0) {
					doc.save()
						.rect(PAGE.marginLeft, y, pageWidth, rowHeight)
						.fill(BRAND.tableStripeBg);
					doc.restore();
				}
				row.forEach((cell, i) => {
					doc.font(FONTS.regular)
						.fontSize(9)
						.fillColor(BRAND.textDark)
						.text(sanitizeText(cell), PAGE.marginLeft + i * colWidth + cellPad, y + 6, {
							width: colWidth - cellPad * 2,
							align: "left",
						});
				});
				y += rowHeight;
			});

			// Table border
			doc.save()
				.rect(PAGE.marginLeft, doc.y, pageWidth, y - doc.y)
				.lineWidth(0.5)
				.strokeColor(BRAND.tableBorder)
				.stroke();
			doc.restore();

			doc.y = y + 10;
			tableHeaders = [];
			tableRows = [];
		};

		// ── Process each HTML line ──
		lines.forEach((rawLine) => {
			const line = rawLine.trim();
			if (!line) return;

			// ── Code blocks ──
			if (line.startsWith("<pre><code") || line === "<pre>") {
				inCodeBlock = true;
				codeLines = [];
				const inner = line.replace(/<pre><code[^>]*>/, "").replace(/<\/code><\/pre>/, "");
				if (inner.trim()) codeLines.push(inner.replace(/<[^>]*>/g, ""));
				if (line.includes("</code></pre>")) {
					inCodeBlock = false;
					renderCodeBlock();
				}
				return;
			}
			if (inCodeBlock) {
				if (line.includes("</code></pre>") || line === "</pre>") {
					const inner = line.replace(/<\/code><\/pre>/, "").replace(/<\/pre>/, "");
					if (inner.trim()) codeLines.push(inner.replace(/<[^>]*>/g, ""));
					inCodeBlock = false;
					renderCodeBlock();
				} else {
					codeLines.push(line.replace(/<[^>]*>/g, ""));
				}
				return;
			}

			// ── Blockquotes ──
			if (line.startsWith("<blockquote>")) {
				inBlockquote = true;
				blockquoteLines = [];
				const inner = line.replace(/<\/?blockquote>/g, "").replace(/<\/?p>/g, "").trim();
				if (inner) blockquoteLines.push(cleanInline(inner));
				if (line.includes("</blockquote>")) {
					inBlockquote = false;
					renderBlockquote();
				}
				return;
			}
			if (inBlockquote) {
				if (line.includes("</blockquote>")) {
					const inner = line.replace(/<\/blockquote>/, "").replace(/<\/?p>/g, "").trim();
					if (inner) blockquoteLines.push(cleanInline(inner));
					inBlockquote = false;
					renderBlockquote();
				} else {
					const inner = line.replace(/<\/?p>/g, "").trim();
					if (inner) blockquoteLines.push(cleanInline(inner));
				}
				return;
			}

			// ── Tables ──
			if (line.startsWith("<table>")) {
				inTable = true;
				tableHeaders = [];
				tableRows = [];
				return;
			}
			if (line === "</table>") {
				inTable = false;
				renderTable();
				return;
			}
			if (inTable) {
				if (line.includes("<th>")) {
					tableHeaders = line
						.replace(/<\/?tr>/g, "").replace(/<\/?thead>/g, "")
						.split(/<\/?th>/).filter((s) => s.trim() && !s.match(/^<\/?/))
						.map((s) => s.replace(/<[^>]*>/g, "").trim());
				} else if (line.includes("<td>")) {
					const cells = line
						.replace(/<\/?tr>/g, "").replace(/<\/?tbody>/g, "")
						.split(/<\/?td>/).filter((s) => s.trim() && !s.match(/^<\/?/))
						.map((s) => s.replace(/<[^>]*>/g, "").trim());
					if (cells.length) tableRows.push(cells);
				}
				return;
			}

			// ── Headings ──
			if (line.startsWith("<h1>") || line.startsWith("<h1 ")) {
				const text = cleanInline(line.replace(/<\/?h1[^>]*>/g, ""));
				ensureSpace(50);
				drawDivider();
				doc.font(FONTS.bold).fontSize(26).fillColor(BRAND.primary)
					.text(text, { align: "left" });
				doc.moveDown(0.6);
				return;
			}
			if (line.startsWith("<h2>") || line.startsWith("<h2 ")) {
				const text = cleanInline(line.replace(/<\/?h2[^>]*>/g, ""));
				ensureSpace(40);
				doc.moveDown(0.3);
				drawDivider();
				doc.font(FONTS.bold).fontSize(19).fillColor(BRAND.primary)
					.text(text, { align: "left" });
				doc.moveDown(0.4);
				return;
			}
			if (line.startsWith("<h3>") || line.startsWith("<h3 ")) {
				const text = cleanInline(line.replace(/<\/?h3[^>]*>/g, ""));
				ensureSpace(30);
				doc.moveDown(0.2);
				doc.font(FONTS.bold).fontSize(15).fillColor(BRAND.textDark)
					.text(text, { align: "left" });
				doc.moveDown(0.3);
				return;
			}
			if (line.match(/^<h[4-6]/)) {
				const text = cleanInline(line.replace(/<\/?h[4-6][^>]*>/g, ""));
				ensureSpace(24);
				doc.font(FONTS.bold).fontSize(12).fillColor(BRAND.textMedium)
					.text(text, { align: "left" });
				doc.moveDown(0.3);
				return;
			}

			// ── Horizontal rule ──
			if (line === "<hr>" || line === "<hr/>") {
				drawDivider();
				return;
			}

			// ── Lists ──
			if (line === "<ol>") { inOrderedList = true; orderedListIndex = 0; listDepth++; return; }
			if (line === "</ol>") { inOrderedList = false; listDepth--; doc.moveDown(0.3); return; }
			if (line === "<ul>") { listDepth++; return; }
			if (line === "</ul>") { listDepth--; doc.moveDown(0.3); return; }
			if (line.startsWith("<li>")) {
				const text = cleanInline(line.replace(/<\/?li>/g, ""));
				if (!text) return;
				const depthLevel = Math.max(0, listDepth - 1);
				const indent = PAGE.marginLeft + depthLevel * 16 + 14;
				const textX = indent + 4;
				const textWidth = doc.page.width - PAGE.marginRight - textX;
				ensureSpace(16);

				if (inOrderedList) {
					orderedListIndex++;
					// Render number
					doc.font(FONTS.bold).fontSize(10.5).fillColor(BRAND.primary)
						.text(`${orderedListIndex}.`, indent - 14, doc.y, {
							width: 18,
							align: "right",
						});
					// Move y back up to the same line, render text beside it
					doc.moveUp();
					doc.font(FONTS.regular).fontSize(10.5).fillColor(BRAND.textDark)
						.text(text, textX, doc.y, {
							width: textWidth,
							lineGap: 2,
						});
				} else {
					// Render bullet marker
					doc.font(FONTS.regular).fontSize(10.5).fillColor(BRAND.primary)
						.text("-", indent - 10, doc.y, {
							width: 10,
						});
					// Move y back up, render text beside it
					doc.moveUp();
					doc.font(FONTS.regular).fontSize(10.5).fillColor(BRAND.textDark)
						.text(text, textX, doc.y, {
							width: textWidth,
							lineGap: 2,
						});
				}
				doc.moveDown(0.15);
				return;
			}

			// ── Images ──
			if (line.includes("<img")) {
				const altMatch = line.match(/alt="([^"]*)"/);
				const caption = altMatch ? `[Image: ${altMatch[1]}]` : "[Image]";
				doc.font(FONTS.italic).fontSize(10).fillColor(BRAND.textLight)
					.text(caption, { align: "center" });
				doc.moveDown(0.5);
				return;
			}

			// ── Paragraphs / default text ──
			if (line.startsWith("<p>") || line.startsWith("<div>")) {
				const text = cleanInline(line.replace(/<\/?(p|div)>/g, ""));
				if (!text) return;
				ensureSpace(16);
				doc.font(FONTS.regular).fontSize(10.5).fillColor(BRAND.textDark)
					.text(text, {
						width: pageWidth,
						lineGap: 2.5,
						align: "left",
					});
				doc.moveDown(0.5);
				return;
			}

			// ── Fallback ──
			if (!line.match(/^<\/?(ul|ol|table|thead|tbody|tr|blockquote|pre)/)) {
				const text = cleanInline(line);
				if (text) {
					doc.font(FONTS.regular).fontSize(10.5).fillColor(BRAND.textDark)
						.text(text, { lineGap: 2 });
					doc.moveDown(0.3);
				}
			}
		});

		// ── Add page numbers + footer to all pages ──
		// CRITICAL: Override addPage to no-op during the footer pass.
		// PDFKit's doc.text() auto-creates pages when y is near the bottom,
		// even with lineBreak:false. This prevents the blank-page cascade.
		const range = doc.bufferedPageRange();
		const totalPages = range.count;

		const _origAddPage = doc.addPage;
		doc.addPage = () => doc; // disable auto page creation

		for (let i = 0; i < totalPages; i++) {
			doc.switchToPage(i);

			const footerY = doc.page.height - PAGE.marginBottom + 15;

			// Footer line
			doc.save()
				.moveTo(PAGE.marginLeft, footerY)
				.lineTo(doc.page.width - PAGE.marginRight, footerY)
				.lineWidth(0.5)
				.strokeColor(BRAND.border)
				.stroke()
				.restore();

			// Page number
			doc.font(FONTS.regular).fontSize(8).fillColor(BRAND.textLight);
			doc.text(
				`Page ${i + 1} of ${totalPages}`,
				PAGE.marginLeft, footerY + 6,
				{ width: pageWidth, align: "right", lineBreak: false }
			);

			// Footer brand
			doc.font(FONTS.regular).fontSize(8).fillColor(BRAND.textLight);
			doc.text(
				"Generated by ChangeAI",
				PAGE.marginLeft, footerY + 6,
				{ width: pageWidth, align: "left", lineBreak: false }
			);
		}

		doc.addPage = _origAddPage; // restore
		doc.end();
	});
};

module.exports = { convertMarkdownToPDF };
