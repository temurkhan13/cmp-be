const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require("docx");

const HEADING_MAP = {
	1: HeadingLevel.HEADING_1,
	2: HeadingLevel.HEADING_2,
	3: HeadingLevel.HEADING_3,
};

/**
 * Recursively build paragraphs from sections.
 */
const buildParagraphs = (sections) => {
	const paragraphs = [];

	for (const section of sections) {
		if (section.heading) {
			paragraphs.push(
				new Paragraph({
					text: section.heading,
					heading: HEADING_MAP[section.level] || HeadingLevel.HEADING_3,
					spacing: { before: 300, after: 150 },
				})
			);
		}

		if (section.content) {
			// Split content into paragraphs by double newline, or treat as single block
			const blocks = section.content.split(/\n\n+/).filter(Boolean);
			for (const block of blocks) {
				paragraphs.push(
					new Paragraph({
						children: [new TextRun(block.trim())],
						spacing: { after: 120 },
					})
				);
			}
		}

		if (section.children && section.children.length > 0) {
			paragraphs.push(...buildParagraphs(section.children));
		}
	}

	return paragraphs;
};

/**
 * Generate a DOCX Buffer from normalized export data.
 */
const generate = async (normalized) => {
	const children = [
		new Paragraph({
			text: normalized.title,
			heading: HeadingLevel.TITLE,
			spacing: { after: 300 },
		}),
		...buildParagraphs(normalized.sections),
	];

	const doc = new Document({
		sections: [{ children }],
	});

	return Packer.toBuffer(doc);
};

module.exports = generate;
