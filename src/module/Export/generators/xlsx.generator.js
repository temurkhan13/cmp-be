const ExcelJS = require("exceljs");

const HEADER_FILL = {
	type: "pattern",
	pattern: "solid",
	fgColor: { argb: "FF00316F" },
};

const HEADER_FONT = {
	bold: true,
	color: { argb: "FFFFFFFF" },
	size: 12,
};

/**
 * Flatten sections into rows for the spreadsheet.
 */
const flattenSections = (sections, parentHeading) => {
	const rows = [];
	for (const section of sections) {
		const sectionName = parentHeading || section.heading || "";

		if (section.content) {
			rows.push({
				section: sectionName,
				heading: section.heading || "",
				content: section.content,
			});
		}

		if (section.children && section.children.length > 0) {
			for (const child of section.children) {
				if (child.content) {
					rows.push({
						section: sectionName,
						heading: child.heading || "",
						content: child.content,
					});
				}

				// Grandchildren
				if (child.children && child.children.length > 0) {
					for (const grandchild of child.children) {
						if (grandchild.content) {
							rows.push({
								section: sectionName,
								heading: grandchild.heading || "",
								content: grandchild.content,
							});
						}
					}
				}
			}
		}
	}
	return rows;
};

/**
 * Generate an XLSX Buffer from normalized export data.
 */
const generate = async (normalized) => {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet(normalized.title.substring(0, 31));

	sheet.columns = [
		{ header: "Section", key: "section", width: 30 },
		{ header: "Heading", key: "heading", width: 30 },
		{ header: "Content", key: "content", width: 80 },
	];

	// Style header row
	const headerRow = sheet.getRow(1);
	headerRow.font = HEADER_FONT;
	headerRow.fill = HEADER_FILL;

	const rows = flattenSections(normalized.sections);
	for (const row of rows) {
		sheet.addRow(row);
	}

	return workbook.xlsx.writeBuffer();
};

module.exports = generate;
