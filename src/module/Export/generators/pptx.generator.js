const PptxGenJS = require("pptxgenjs");
const MarkdownIt = require("markdown-it");

const md = new MarkdownIt();

// ── Brand constants ─────────────────────────────────────────────
const COLOR = {
	primary: "00316F",
	accent: "C3E11D",
	textDark: "212121",
	textMedium: "555555",
	textLight: "888888",
	white: "FFFFFF",
};

// ── Layout (inches) — LAYOUT_WIDE = 13.33 x 7.5 ───────────────
const SLIDE = {
	marginX: 0.8,
	headerBarH: 0.07,
	headerY: 0.3,
	contentStartY: 1.05,
	maxContentY: 6.45,
	footerBarY: 6.6,
	footerTextY: 6.75,
	get textW() { return 13.33 - this.marginX * 2; },
};

const FS = {
	body: 12, bullet: 12, h3: 16, h4: 13,
	slideTitle: 22, coverSubtitle: 12, coverTitle: 34,
	footer: 9, footerBrand: 10, tableBody: 10, tableHeader: 10,
};

const LINE_SP = 1.35;

// ── Helpers ─────────────────────────────────────────────────────

const clean = (text) => {
	if (!text) return "";
	return text
		.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
		.replace(/[^\x00-\xFF]/g, "").replace(/\s+/g, " ").trim();
};

const stripTags = (html) => clean((html || "").replace(/<[^>]*>/g, ""));

const addFooter = (slide, pptx, slideNum, totalSlides) => {
	slide.addShape(pptx.ShapeType.rect, {
		x: 0, y: SLIDE.footerBarY, w: "100%", h: 0.04, fill: { color: COLOR.accent },
	});
	slide.addText("Powered by ChangeAI", {
		x: SLIDE.marginX, y: SLIDE.footerTextY, w: "50%",
		fontSize: FS.footerBrand, color: COLOR.textLight, italic: true,
	});
	slide.addText(`${slideNum} / ${totalSlides}`, {
		x: 0, y: SLIDE.footerTextY, w: 13.33 - SLIDE.marginX,
		fontSize: FS.footer, color: COLOR.textLight, align: "right",
	});
};

/**
 * Parse inline HTML into pptxgenjs text objects, preserving spaces around bold/italic.
 */
const parseInline = (html, baseFontSize) => {
	if (!html) return [];
	const sz = baseFontSize || FS.body;
	// Add spaces around tags to preserve word boundaries
	const spaced = html
		.replace(/<(strong|b|em|i)>/gi, " <$1>")
		.replace(/<\/(strong|b|em|i)>/gi, "</$1> ");
	const parts = spaced.split(/(<\/?(?:strong|b|em|i)[^>]*>)/gi);
	const objs = [];
	let bold = false, italic = false;

	for (const part of parts) {
		if (!part) continue;
		const lower = part.toLowerCase();
		if (lower === "<strong>" || lower === "<b>") { bold = true; continue; }
		if (lower === "</strong>" || lower === "</b>") { bold = false; continue; }
		if (lower === "<em>" || lower === "<i>") { italic = true; continue; }
		if (lower === "</em>" || lower === "</i>") { italic = false; continue; }
		if (lower.startsWith("<")) continue;

		let text = part.replace(/<[^>]*>/g, "")
			.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
			.replace(/[^\x00-\xFF]/g, "");

		const lead = text.startsWith(" ") ? " " : "";
		const trail = text.endsWith(" ") ? " " : "";
		text = lead + text.trim().replace(/\s+/g, " ") + trail;

		if (!text || text === " ") {
			if (objs.length > 0 && text === " ") objs.push({ text: " ", options: { fontSize: sz, color: COLOR.textDark } });
			continue;
		}
		objs.push({ text, options: { fontSize: sz, color: COLOR.textDark, bold, italic } });
	}
	return objs;
};

/**
 * Parse markdown-it HTML into structured slide items.
 * Handles multi-line table/list structures properly.
 */
const htmlToSlideItems = (html) => {
	const items = [];
	const lines = html.split("\n");

	let inUl = false, inOl = false, olIndex = 0;
	let inTable = false, inThead = false, inTbody = false;
	let currentRow = [];
	let tableHeaders = [], tableRows = [];
	let inLi = false, liBuffer = "";

	const flushTable = () => {
		if (tableHeaders.length === 0 && tableRows.length === 0) return;
		items.push({ type: "table", headers: tableHeaders, rows: tableRows });
		tableHeaders = [];
		tableRows = [];
	};

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;

		// ── Table (multi-line aware) ──
		if (line === "<table>") { inTable = true; tableHeaders = []; tableRows = []; continue; }
		if (line === "</table>") { inTable = false; flushTable(); continue; }
		if (inTable) {
			if (line === "<thead>") { inThead = true; continue; }
			if (line === "</thead>") { inThead = false; continue; }
			if (line === "<tbody>") { inTbody = true; continue; }
			if (line === "</tbody>") { inTbody = false; continue; }
			if (line === "<tr>") { currentRow = []; continue; }
			if (line === "</tr>") {
				if (inThead) tableHeaders = currentRow;
				else tableRows.push(currentRow);
				currentRow = [];
				continue;
			}
			// Individual <th> or <td> on its own line
			if (line.startsWith("<th>") || line.startsWith("<th ")) {
				currentRow.push(stripTags(line));
				continue;
			}
			if (line.startsWith("<td>") || line.startsWith("<td ")) {
				currentRow.push(stripTags(line));
				continue;
			}
			// All-in-one-line row: <tr><th>A</th><th>B</th></tr>
			if (line.includes("<th>")) {
				const cells = line.split(/<\/?th>/).filter((s) => s.trim() && !s.match(/^<\/?/)).map(stripTags);
				if (cells.length) tableHeaders = cells;
				continue;
			}
			if (line.includes("<td>")) {
				const cells = line.split(/<\/?td>/).filter((s) => s.trim() && !s.match(/^<\/?/)).map(stripTags);
				if (cells.length) tableRows.push(cells);
				continue;
			}
			continue;
		}

		// ── Lists ──
		if (line === "<ul>") { inUl = true; continue; }
		if (line === "</ul>") { inUl = false; continue; }
		if (line === "<ol>") { inOl = true; olIndex = 0; continue; }
		if (line === "</ol>") { inOl = false; continue; }
		if (line.startsWith("<li>")) {
			const inner = line.replace(/<\/?li>/g, "");
			const textObjs = parseInline(inner, FS.bullet);
			if (inOl) { olIndex++; items.push({ type: "numberedItem", num: olIndex, textObjs }); }
			else { items.push({ type: "bulletItem", textObjs }); }
			continue;
		}

		// ── Headings ──
		if (line.match(/^<h1[> ]/)) { items.push({ type: "h1", text: stripTags(line) }); continue; }
		if (line.match(/^<h2[> ]/)) { items.push({ type: "h2", text: stripTags(line) }); continue; }
		if (line.match(/^<h3[> ]/)) { items.push({ type: "h3", text: stripTags(line) }); continue; }
		if (line.match(/^<h[4-6][> ]/)) { items.push({ type: "h4", text: stripTags(line) }); continue; }

		// ── HR ──
		if (line === "<hr>" || line === "<hr/>") { items.push({ type: "hr" }); continue; }

		// ── Blockquote / structural tags — skip ──
		if (line.match(/^<\/?(blockquote|pre|code|div|section|figure|figcaption|header|footer|nav|aside|main)/)) continue;

		// ── Paragraphs ──
		if (line.startsWith("<p>") || line.startsWith("<p ")) {
			const inner = line.replace(/<\/?p[^>]*>/g, "");
			const textObjs = parseInline(inner, FS.body);
			if (textObjs.length > 0) items.push({ type: "paragraph", textObjs });
			continue;
		}

		// ── Skip remaining close/open tags ──
		if (line.startsWith("</") || line.startsWith("<ul") || line.startsWith("<ol") || line.startsWith("<li")) continue;

		// ── Fallback: plain text ──
		const text = stripTags(line);
		if (text) items.push({ type: "paragraph", textObjs: [{ text, options: { fontSize: FS.body, color: COLOR.textDark } }] });
	}

	return items;
};

/**
 * Estimate text height. At 12pt on 11.7" wide, ~140 chars/line, ~0.22"/line.
 */
const estimateHeight = (text, fontSize) => {
	if (!text) return 0.22;
	const sz = fontSize || FS.body;
	const charsPerLine = Math.floor(SLIDE.textW * 12);
	const lineH = 0.22 * (sz / 12);
	const lines = text.split("\n").reduce((acc, l) => acc + Math.max(1, Math.ceil((l.length || 1) / charsPerLine)), 0);
	return Math.max(0.22, lines * lineH);
};

const textObjsToString = (objs) => (objs || []).map((o) => o.text || "").join("");

// ═══════════════════════════════════════════════════════════════
//  GENERATE
// ═══════════════════════════════════════════════════════════════

const generate = async (normalized) => {
	const pptx = new PptxGenJS();
	pptx.layout = "LAYOUT_WIDE";
	pptx.author = "ChangeAI";
	pptx.subject = clean(normalized.title);

	const accentColor = (normalized.branding?.accentColor || `#${COLOR.accent}`).replace("#", "");
	const isPlaybook = normalized.metadata?.source === "playbook";
	const titleText = clean(normalized.title);
	const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

	// ── Cover Slide ──
	const cover = pptx.addSlide();
	cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 1.2, fill: { color: COLOR.primary } });
	cover.addText(isPlaybook ? "DIGITAL PLAYBOOK" : "ASSESSMENT REPORT", {
		x: 0, y: 0.4, w: "100%", fontSize: FS.coverSubtitle, color: COLOR.textLight, align: "center", charSpacing: 4, italic: true,
	});
	const lineW = 3;
	cover.addShape(pptx.ShapeType.line, { x: (13.33 - lineW) / 2, y: 1.6, w: lineW, h: 0, line: { color: accentColor, width: 3 } });
	cover.addText(titleText, {
		x: 1.0, y: 1.9, w: 11.33, h: 1.2, fontSize: FS.coverTitle, color: COLOR.primary, align: "center", bold: true, valign: "middle",
	});
	if (normalized.metadata?.workspaceName) {
		cover.addText(clean(normalized.metadata.workspaceName), {
			x: 0, y: 3.3, w: "100%", fontSize: 14, color: COLOR.textMedium, align: "center",
		});
	}
	cover.addText(dateStr, { x: 0, y: 3.8, w: "100%", fontSize: 11, color: COLOR.textLight, align: "center" });
	cover.addText("Powered by ChangeAI", {
		x: 0, y: 6.5, w: "100%", fontSize: FS.footerBrand, color: COLOR.textLight, align: "center", italic: true,
	});

	// ── Parse markdown → slide items ──
	const html = md.render(normalized.markdown || "");
	const allItems = htmlToSlideItems(html);

	const slides = [];
	let currentSlide = null;
	let yPos = SLIDE.contentStartY;
	let currentSectionHeading = "";

	const newSlide = (headerText) => {
		currentSlide = pptx.addSlide();
		slides.push(currentSlide);
		currentSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: SLIDE.headerBarH, fill: { color: accentColor } });
		if (headerText) {
			currentSlide.addText(headerText, {
				x: SLIDE.marginX, y: SLIDE.headerY, w: SLIDE.textW, fontSize: FS.slideTitle, color: COLOR.primary, bold: true,
			});
			currentSlide.addShape(pptx.ShapeType.line, {
				x: SLIDE.marginX, y: SLIDE.headerY + 0.55, w: SLIDE.textW, h: 0, line: { color: "DCDCDC", width: 0.5 },
			});
			yPos = SLIDE.contentStartY;
		} else {
			yPos = SLIDE.headerY;
		}
	};

	const ensureSpace = (needed) => {
		if (!currentSlide || yPos + needed > SLIDE.maxContentY) {
			newSlide(currentSectionHeading ? currentSectionHeading + (currentSlide ? " (cont.)" : "") : "");
		}
	};

	// ── Render items ──
	for (const item of allItems) {
		switch (item.type) {
			case "h1":
			case "h2":
				currentSectionHeading = item.text;
				newSlide(item.text);
				break;

			case "h3":
				yPos += 0.08;
				ensureSpace(0.35);
				currentSlide.addText(item.text, {
					x: SLIDE.marginX, y: yPos, w: SLIDE.textW, fontSize: FS.h3, color: COLOR.primary, bold: true,
				});
				yPos += 0.3;
				break;

			case "h4":
				yPos += 0.06;
				ensureSpace(0.3);
				currentSlide.addText(item.text, {
					x: SLIDE.marginX, y: yPos, w: SLIDE.textW, fontSize: FS.h4, color: COLOR.textMedium, bold: true,
				});
				yPos += 0.25;
				break;

			case "paragraph": {
				const fullText = textObjsToString(item.textObjs);
				const h = estimateHeight(fullText, FS.body);
				ensureSpace(h);
				currentSlide.addText(item.textObjs, {
					x: SLIDE.marginX, y: yPos, w: SLIDE.textW,
					fontSize: FS.body, color: COLOR.textDark, lineSpacingMultiple: LINE_SP, valign: "top",
				});
				yPos += h + 0.06;
				break;
			}

			case "bulletItem": {
				const fullText = textObjsToString(item.textObjs);
				const h = estimateHeight(fullText, FS.bullet);
				ensureSpace(h);
				const bulletObjs = item.textObjs.map((o) => ({
					...o, options: { ...o.options, fontSize: FS.bullet, bullet: { code: "2022" }, indentLevel: 0 },
				}));
				currentSlide.addText(
					bulletObjs.length > 0 ? bulletObjs : [{ text: fullText, options: { fontSize: FS.bullet, bullet: { code: "2022" } } }],
					{ x: SLIDE.marginX + 0.25, y: yPos, w: SLIDE.textW - 0.25, fontSize: FS.bullet, color: COLOR.textDark, lineSpacingMultiple: LINE_SP, valign: "top" }
				);
				yPos += h + 0.03;
				break;
			}

			case "numberedItem": {
				const fullText = textObjsToString(item.textObjs);
				const h = estimateHeight(fullText, FS.bullet);
				ensureSpace(h);
				const numObjs = [
					{ text: `${item.num}. `, options: { fontSize: FS.bullet, bold: true, color: COLOR.primary } },
					...item.textObjs,
				];
				currentSlide.addText(numObjs, {
					x: SLIDE.marginX + 0.25, y: yPos, w: SLIDE.textW - 0.25, fontSize: FS.bullet, color: COLOR.textDark, lineSpacingMultiple: LINE_SP, valign: "top",
				});
				yPos += h + 0.03;
				break;
			}

			case "table": {
				const colCount = item.headers.length || (item.rows[0] ? item.rows[0].length : 0);
				if (colCount === 0) break;
				const colW = SLIDE.textW / colCount;
				const rows = [];
				if (item.headers.length > 0) {
					rows.push(item.headers.map((h) => ({
						text: h, options: { fontSize: FS.tableHeader, bold: true, color: "FFFFFF", fill: { color: COLOR.primary }, align: "left", margin: [3, 5, 3, 5] },
					})));
				}
				item.rows.forEach((row, idx) => {
					rows.push(row.map((cell) => ({
						text: cell, options: { fontSize: FS.tableBody, color: COLOR.textDark, fill: idx % 2 === 0 ? { color: "F5F7FA" } : undefined, align: "left", margin: [3, 5, 3, 5] },
					})));
				});
				const rowH = 0.32;
				const tableH = rows.length * rowH + 0.1;
				ensureSpace(tableH);
				currentSlide.addTable(rows, {
					x: SLIDE.marginX, y: yPos, w: SLIDE.textW, colW: Array(colCount).fill(colW),
					border: { type: "solid", pt: 0.5, color: "DCDCDC" }, rowH, autoPage: false,
				});
				yPos += tableH + 0.1;
				break;
			}

			case "hr":
				yPos += 0.08;
				break;

			default:
				break;
		}
	}

	// ── Footers ──
	const totalSlides = slides.length;
	slides.forEach((slide, idx) => addFooter(slide, pptx, idx + 1, totalSlides));

	return pptx.write({ outputType: "nodebuffer" });
};

module.exports = generate;
