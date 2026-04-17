const ExcelJS = require("exceljs");
const MarkdownIt = require("markdown-it");

const md = new MarkdownIt();

// ── Brand constants (ARGB format for ExcelJS) ───────────────────
const COLOR = {
	primary: "FF00316F",
	accent: "FFC3E11D",
	white: "FFFFFFFF",
	textDark: "FF212121",
	textMedium: "FF555555",
	textLight: "FF888888",
	bgLight: "FFF5F7FA",
	border: "FFDCDCDC",
	stripeBg: "FFF8F9FB",
};

const THIN_BORDER = {
	top: { style: "thin", color: { argb: COLOR.border } },
	bottom: { style: "thin", color: { argb: COLOR.border } },
	left: { style: "thin", color: { argb: COLOR.border } },
	right: { style: "thin", color: { argb: COLOR.border } },
};

/**
 * Sanitize: strip emoji + decode HTML entities + strip tags.
 */
const clean = (text) => {
	if (!text) return "";
	return text
		.replace(/<[^>]*>/g, "")
		.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
		.replace(/[^\x00-\xFF]/g, "")
		.replace(/\s+/g, " ")
		.trim();
};

/**
 * Parse markdown-it HTML into structured data rows for the spreadsheet.
 * Returns array of { section, heading, content, isSection, isTable, tableHeaders, tableRows }
 */
const htmlToRows = (html) => {
	const rows = [];
	const lines = html.split("\n");

	let currentH2 = "";
	let currentH3 = "";
	let inTable = false, inThead = false, inTbody = false;
	let currentTableRow = [];
	let tableHeaders = [], tableDataRows = [];
	let inUl = false, inOl = false, olIndex = 0;

	const flushTable = () => {
		if (tableHeaders.length === 0 && tableDataRows.length === 0) return;
		rows.push({
			section: currentH2,
			heading: currentH3 || "",
			content: "",
			isSection: false,
			isTable: true,
			tableHeaders,
			tableRows: tableDataRows,
		});
		tableHeaders = [];
		tableDataRows = [];
	};

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;

		// ── Headings — track section context ──
		if (line.match(/^<h1[> ]/)) {
			currentH2 = clean(line);
			currentH3 = "";
			rows.push({ section: currentH2, heading: "", content: "", isSection: true });
			continue;
		}
		if (line.match(/^<h2[> ]/)) {
			currentH2 = clean(line);
			currentH3 = "";
			rows.push({ section: currentH2, heading: "", content: "", isSection: true });
			continue;
		}
		if (line.match(/^<h3[> ]/)) {
			currentH3 = clean(line);
			continue;
		}
		if (line.match(/^<h[4-6][> ]/)) {
			currentH3 = clean(line);
			continue;
		}

		// ── Table (multi-line aware) ──
		if (line === "<table>") { inTable = true; tableHeaders = []; tableDataRows = []; continue; }
		if (line === "</table>") { inTable = false; flushTable(); continue; }
		if (inTable) {
			if (line === "<thead>") { inThead = true; continue; }
			if (line === "</thead>") { inThead = false; continue; }
			if (line === "<tbody>") { inTbody = true; continue; }
			if (line === "</tbody>") { inTbody = false; continue; }
			if (line === "<tr>") { currentTableRow = []; continue; }
			if (line === "</tr>") {
				if (inThead) tableHeaders = currentTableRow;
				else tableDataRows.push(currentTableRow);
				currentTableRow = [];
				continue;
			}
			if (line.startsWith("<th>") || line.startsWith("<th ") || line.startsWith("<td>") || line.startsWith("<td ")) {
				currentTableRow.push(clean(line));
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
			const text = clean(line.replace(/<\/?li>/g, ""));
			if (!text) continue;
			const prefix = inOl ? `${++olIndex}. ` : "- ";
			rows.push({
				section: currentH2,
				heading: currentH3 || "",
				content: prefix + text,
				isSection: false,
			});
			continue;
		}

		// ── HR — skip ──
		if (line === "<hr>" || line === "<hr/>") continue;

		// ── Paragraphs ──
		if (line.startsWith("<p>") || line.startsWith("<p ")) {
			const text = clean(line.replace(/<\/?p[^>]*>/g, ""));
			if (!text) continue;
			rows.push({
				section: currentH2,
				heading: currentH3 || "",
				content: text,
				isSection: false,
			});
			continue;
		}

		// ── Skip structural tags ──
		if (line.startsWith("</") || line.startsWith("<ul") || line.startsWith("<ol") || line.startsWith("<li") ||
			line.match(/^<\/?(blockquote|pre|code|div|section|figure)/)) continue;

		// ── Fallback ──
		const text = clean(line);
		if (text) {
			rows.push({ section: currentH2, heading: currentH3 || "", content: text, isSection: false });
		}
	}

	return rows;
};

/**
 * Generate an XLSX Buffer from normalized export data.
 * Uses markdown-it to parse markdown → HTML → structured rows.
 */
const generate = async (normalized) => {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = "ChangeAI";
	workbook.created = new Date();

	const titleText = clean(normalized.title || "Export");
	const sheetName = titleText.substring(0, 31).replace(/[*?:/\\[\]]/g, "");
	const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
	const sourceLabel = normalized.metadata?.source === "playbook" ? "Digital Playbook" : "Assessment Report";

	// ── Parse markdown → HTML → rows ──
	const html = md.render(normalized.markdown || "");
	const dataRows = htmlToRows(html);

	// ── Create main content sheet ──
	const sheet = workbook.addWorksheet(sheetName, {
		views: [{ state: "frozen", ySplit: 4 }],
	});

	// ── Title row ──
	sheet.mergeCells("A1:D1");
	const titleCell = sheet.getCell("A1");
	titleCell.value = titleText;
	titleCell.font = { bold: true, size: 16, color: { argb: COLOR.primary }, name: "Calibri" };
	titleCell.alignment = { horizontal: "left", vertical: "middle" };
	sheet.getRow(1).height = 36;

	// ── Subtitle row ──
	sheet.mergeCells("A2:D2");
	const subtitleCell = sheet.getCell("A2");
	subtitleCell.value = `${sourceLabel}  |  ${dateStr}  |  Generated by ChangeAI`;
	subtitleCell.font = { size: 9, color: { argb: COLOR.textLight }, italic: true, name: "Calibri" };
	subtitleCell.alignment = { horizontal: "left", vertical: "middle" };
	sheet.getRow(2).height = 22;

	// ── Spacer row ──
	sheet.getRow(3).height = 6;

	// ── Column definitions ──
	sheet.columns = [
		{ key: "section", width: 30 },
		{ key: "heading", width: 28 },
		{ key: "content", width: 85 },
		{ key: "extra", width: 30 },
	];

	// ── Header row (row 4) ──
	const headerRow = sheet.getRow(4);
	headerRow.values = ["Section", "Heading", "Content", ""];
	headerRow.height = 28;
	["A4", "B4", "C4", "D4"].forEach((ref) => {
		const cell = sheet.getCell(ref);
		cell.font = { bold: true, size: 11, color: { argb: COLOR.white }, name: "Calibri" };
		cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.primary } };
		cell.alignment = { horizontal: "left", vertical: "middle" };
		cell.border = THIN_BORDER;
	});

	// ── Data rows ──
	let prevSection = "";
	let rowIdx = 0;

	for (const row of dataRows) {
		// Handle table data — expand into multiple rows with column headers
		if (row.isTable) {
			const { tableHeaders: headers, tableRows: tRows } = row;
			// Add a header row for the table
			if (headers.length > 0) {
				const hRow = sheet.addRow({
					section: row.section,
					heading: row.heading || "Table",
					content: headers.join("  |  "),
				});
				hRow.eachCell({ includeEmpty: true }, (cell) => {
					cell.font = { bold: true, size: 10, color: { argb: COLOR.primary }, name: "Calibri" };
					cell.alignment = { vertical: "top", wrapText: true, horizontal: "left" };
					cell.border = THIN_BORDER;
					cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.bgLight } };
				});
				hRow.height = 22;
				rowIdx++;
			}

			// Add each table data row
			for (const tRow of tRows) {
				const dRow = sheet.addRow({
					section: "",
					heading: "",
					content: tRow.join("  |  "),
				});
				const isStripe = rowIdx % 2 === 1;
				dRow.eachCell({ includeEmpty: true }, (cell) => {
					cell.font = { size: 10, color: { argb: COLOR.textDark }, name: "Calibri" };
					cell.alignment = { vertical: "top", wrapText: true, horizontal: "left" };
					cell.border = THIN_BORDER;
					if (isStripe) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.stripeBg } };
				});
				rowIdx++;
			}
			continue;
		}

		// Skip section-header-only rows that have no content
		if (row.isSection && !row.content) {
			prevSection = row.section;
			continue;
		}

		const dataRow = sheet.addRow({
			section: row.section || "",
			heading: row.heading || "",
			content: row.content || "",
		});

		const isStripe = rowIdx % 2 === 1;

		dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
			cell.font = {
				size: 10,
				color: { argb: COLOR.textDark },
				name: "Calibri",
				...(colNumber === 1 && row.section !== prevSection ? { bold: true, color: { argb: COLOR.primary } } : {}),
			};
			cell.alignment = { vertical: "top", wrapText: true, horizontal: "left" };
			cell.border = THIN_BORDER;
			if (isStripe) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.stripeBg } };
		});

		// Dynamic row height based on content length
		const contentLen = (row.content || "").length;
		if (contentLen > 100) {
			dataRow.height = Math.min(100, 18 + Math.floor(contentLen / 90) * 14);
		}

		// Section change border
		if (row.section && row.section !== prevSection) {
			dataRow.eachCell({ includeEmpty: true }, (cell) => {
				cell.border = { ...THIN_BORDER, top: { style: "medium", color: { argb: COLOR.primary } } };
			});
			prevSection = row.section;
		}

		rowIdx++;
	}

	// ── Auto-filter ──
	const lastRow = 4 + rowIdx;
	sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: lastRow, column: 3 } };

	// ── Also create per-table sheets if there are tables with 4+ columns ──
	// (Tables with many columns are hard to read in a 3-col layout)
	let tableIdx = 0;
	for (const row of dataRows) {
		if (!row.isTable || row.tableHeaders.length < 4) continue;
		tableIdx++;
		const tSheetName = `Table ${tableIdx}`.substring(0, 31);
		const tSheet = workbook.addWorksheet(tSheetName);

		// Header row
		const colCount = row.tableHeaders.length;
		const colWidth = Math.max(15, Math.floor(100 / colCount));
		tSheet.columns = row.tableHeaders.map((h, i) => ({ key: `col${i}`, width: colWidth }));

		const tHeaderRow = tSheet.getRow(1);
		tHeaderRow.values = row.tableHeaders;
		tHeaderRow.height = 28;
		tHeaderRow.eachCell((cell) => {
			cell.font = { bold: true, size: 11, color: { argb: COLOR.white }, name: "Calibri" };
			cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.primary } };
			cell.alignment = { horizontal: "left", vertical: "middle" };
			cell.border = THIN_BORDER;
		});

		// Data rows
		row.tableRows.forEach((tRow, rIdx) => {
			const obj = {};
			tRow.forEach((cell, cIdx) => { obj[`col${cIdx}`] = cell; });
			const dRow = tSheet.addRow(obj);
			dRow.eachCell({ includeEmpty: true }, (cell) => {
				cell.font = { size: 10, color: { argb: COLOR.textDark }, name: "Calibri" };
				cell.alignment = { vertical: "top", wrapText: true, horizontal: "left" };
				cell.border = THIN_BORDER;
				if (rIdx % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.stripeBg } };
			});
		});

		tSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + row.tableRows.length, column: colCount } };
		tSheet.views = [{ state: "frozen", ySplit: 1 }];
	}

	return workbook.xlsx.writeBuffer();
};

module.exports = generate;
