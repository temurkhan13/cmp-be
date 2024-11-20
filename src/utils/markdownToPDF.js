const fs = require("fs");
const PDFDocument = require("pdfkit");
const MarkdownIt = require("markdown-it");

const md = new MarkdownIt();

const convertMarkdownToPDF = (markdown, outputPath) => {
	const doc = new PDFDocument({
		margins: { top: 50, bottom: 50, left: 50, right: 50 },
	});

	doc.pipe(fs.createWriteStream(outputPath));

	const styles = {
		h1: { fontSize: 24, font: "Helvetica-Bold", spacing: 1 },
		h2: { fontSize: 22, font: "Helvetica-Bold", spacing: 1 },
		h3: { fontSize: 20, font: "Helvetica-Bold", spacing: 1 },
		h4: { fontSize: 16, font: "Helvetica-Bold", spacing: 1 },
		h5: { fontSize: 14, font: "Helvetica-Bold", spacing: 1 },
		h6: { fontSize: 12, font: "Helvetica-Bold", spacing: 1 },
		p: { fontSize: 12, font: "Helvetica", spacing: 1 },
		strong: { font: "Helvetica-Bold" },
		em: { font: "Helvetica-Oblique" },
		code: { font: "Courier", fontSize: 11 },
		li: { fontSize: 12, indent: 20, spacing: 0.8 },
		sup: { fontSize: 8, rise: 8 },
		sub: { fontSize: 8, rise: -4 },
		strike: { strikethrough: true },
		u: { underline: true },
	};

	const processInlineTags = (text) => {
		let currentFont = styles.p.font;
		let currentSize = styles.p.fontSize;
		let formatting = {
			underline: false,
			strike: false,
			link: false,
		};

		text = text.replace(/<(strong|b)>(.*?)<\/(?:strong|b)>/g, (_, tag, content) => {
			currentFont = styles.strong.font;
			doc.font(currentFont);
			return content;
		});

		text = text.replace(/<(em|i)>(.*?)<\/(?:em|i)>/g, (_, tag, content) => {
			currentFont = styles.em.font;
			doc.font(currentFont);
			return content;
		});

		text = text.replace(/<u>(.*?)<\/u>/g, (_, content) => {
			formatting.underline = true;
			return content;
		});

		text = text.replace(/<(strike|s|del)>(.*?)<\/(?:strike|s|del)>/g, (_, tag, content) => {
			formatting.strike = true;
			return content;
		});

		text = text.replace(/<sup>(.*?)<\/sup>/g, (_, content) => {
			currentSize = styles.sup.fontSize;
			doc.fontSize(currentSize);
			return content;
		});

		text = text.replace(/<sub>(.*?)<\/sub>/g, (_, content) => {
			currentSize = styles.sub.fontSize;
			doc.fontSize(currentSize);
			return content;
		});

		text = text.replace(/<mark>(.*?)<\/mark>/g, (_, content) => {
			return content;
		});

		text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, (_, href, content) => {
			formatting.link = true;
			return content + ` (${href})`;
		});

		return { text, formatting };
	};

	const htmlContent = md.render(markdown).split("\n");
	let inBlockquote = false;
	let inCodeBlock = false;

	htmlContent.forEach((line) => {
		line = line.trim();
		if (!line) return;
		if (line.startsWith("<h1>")) {
			doc
				.font(styles.h1.font)
				.fontSize(styles.h1.fontSize)
				.text(line.replace(/<\/?h1>/g, "").trim(), {
					align: "center",
					underline: true,
				});
			doc.moveDown(styles.h1.spacing);
		} else if (line.startsWith("<h2>")) {
			doc
				.font(styles.h2.font)
				.fontSize(styles.h2.fontSize)
				.text(line.replace(/<\/?h2>/g, "").trim());
			doc.moveDown(styles.h2.spacing);
		} else if (line.startsWith("<h3>")) {
			doc
				.font(styles.h3.font)
				.fontSize(styles.h3.fontSize)
				.text(line.replace(/<\/?h3>/g, "").trim());
			doc.moveDown(styles.h3.spacing);
		} else if (line.startsWith("<h4>")) {
			doc
				.font(styles.h4.font)
				.fontSize(styles.h4.fontSize)
				.text(line.replace(/<\/?h4>/g, "").trim());
			doc.moveDown(styles.h4.spacing);
		} else if (line.startsWith("<p>")) {
			const cleanLine = line.replace(/<\/?p>/g, "").trim();
			const { text, formatting } = processInlineTags(cleanLine);

			doc.font(styles.p.font).fontSize(styles.p.fontSize).text(text, {
				align: "justify",
				lineGap: 2,
				underline: formatting.underline,
				strike: formatting.strike,
				link: formatting.link,
			});
			doc.moveDown(styles.p.spacing);
		} else if (line.startsWith("<div>")) {
			const cleanLine = line.replace(/<\/?div>/g, "").trim();
			const { text, formatting } = processInlineTags(cleanLine);

			doc.font(styles.p.font).fontSize(styles.p.fontSize).text(text, {
				align: "left",
				lineGap: 2,
				underline: formatting.underline,
				strike: formatting.strike,
			});
			doc.moveDown(0.5);
		} else if (line.startsWith("<blockquote>")) {
			inBlockquote = true;
			doc.fontSize(styles.p.fontSize).font(styles.em.font);
		} else if (line.startsWith("</blockquote>")) {
			inBlockquote = false;
			doc.moveDown(1);
		} else if (line.startsWith("<pre><code>")) {
			inCodeBlock = true;
			doc.font(styles.code.font).fontSize(styles.code.fontSize);
		} else if (line.startsWith("</code></pre>")) {
			inCodeBlock = false;
			doc.moveDown(1);
		} else if (line.startsWith("<table>")) {
			inTable = true;
			tableHeaders = [];
			tableAlignments = [];
		} else if (line.startsWith("<tr><th>")) {
			tableHeaders = line
				.replace(/<\/?tr>/g, "")
				.replace(/<\/?th>/g, "|")
				.split("|")
				.filter((header) => header.trim())
				.map((header) => header.trim());
		} else if (line.startsWith("<tr><td>")) {
			// Process table rows
			const cells = line
				.replace(/<\/?tr>/g, "")
				.replace(/<\/?td>/g, "|")
				.split("|")
				.filter((cell) => cell.trim())
				.map((cell) => cell.trim());

			// Calculate column widths
			const columnWidth = 400 / cells.length;
			let xPos = 50;

			cells.forEach((cell, index) => {
				const { text, formatting } = processInlineTags(cell);
				doc.font(styles.p.font).fontSize(styles.p.fontSize).text(text, xPos, doc.y, {
					width: columnWidth,
					align: "left",
				});
				xPos += columnWidth;
			});

			doc.moveDown(0.5);
		} else if (line.startsWith("</table>")) {
			inTable = false;
			doc.moveDown(1);
		} else if (line.startsWith("<ul>") || line.startsWith("<ol>")) {
			doc.moveDown(0.5);
		} else if (line.startsWith("<li>")) {
			// Remove both opening and closing li tags completely
			const cleanLine = line.replace(/<li>|<\/li>/g, "").trim();
			const { text, formatting } = processInlineTags(cleanLine);

			doc
				.font(styles.p.font)
				.fontSize(styles.li.fontSize)
				.text("• " + text, {
					indent: styles.li.indent,
					align: "left",
					underline: formatting.underline,
					strike: formatting.strike,
				});
			doc.moveDown(styles.li.spacing);
		} else if (line.startsWith("</ul>") || line.startsWith("</ol>")) {
			doc.moveDown(0.5);
		} else if (line.includes("<img")) {
			const altText = line.match(/alt="(.*?)"/);
			const caption = altText ? `[Image: ${altText[1]}]` : "[Image]";
			doc.font(styles.em.font).fontSize(styles.p.fontSize).text(caption, { align: "center" });
			doc.moveDown(1);
		} else if (inBlockquote) {
			const { text, formatting } = processInlineTags(line);
			doc.text("> " + text, {
				indent: 20,
				align: "left",
				underline: formatting.underline,
				strike: formatting.strike,
			});
		} else if (inCodeBlock) {
			doc.text(line, {
				indent: 10,
				align: "left",
			});
		} else if (line) {
			const { text, formatting } = processInlineTags(line);
			doc.font(styles.p.font).fontSize(styles.p.fontSize).text(text, {
				underline: formatting.underline,
				strike: formatting.strike,
			});
			doc.moveDown(0.5);
		}
	});

	doc.end();
};

module.exports = { convertMarkdownToPDF };
