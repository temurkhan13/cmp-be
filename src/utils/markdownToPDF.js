const fs = require("fs");
const PDFDocument = require("pdfkit");
const MarkdownIt = require("markdown-it");

const md = new MarkdownIt();

const convertMarkdownToPdf = (markdown, outputPath) => {
	// Extract markdown content from the input
	const markdownContent = markdown.match(/```md([\s\S]*?)```/)[1].trim();

	// Convert markdown to plain text while preserving lists and basic formatting
	const cleanedContent = markdownContent
		.replace(/!\[.*\]\(.*\)/g, "") // Remove image markdown
		.replace(/\[([^\]]+)\]\(.*\)/g, "$1") // Remove links but keep the text
		.replace(/^#+\s*(.*)/gm, "$1") // Keep header text but remove markdown symbols
		.replace(/[*_~`]/g, "") // Remove formatting symbols but keep the text
		.trim();

	// Create a new PDF document
	const doc = new PDFDocument();
	doc.pipe(fs.createWriteStream(outputPath));

	// Add cleaned plain text content to the PDF, preserving paragraph and list formatting
	cleanedContent.split("\n").forEach((line) => {
		if (line.trim().startsWith("- ") || line.trim().match(/^\d+\./)) {
			doc.text(line.trim(), { indent: 20 }); // Indent list items
		} else {
			doc.text(line.trim());
		}
		doc.moveDown(0.5);
	});

	// Finalize the PDF and end the stream
	doc.end();
};

const convertMarkdownToPDF = (markdown, outputPath) => {
	const doc = new PDFDocument();
	doc.pipe(fs.createWriteStream(outputPath));

	const htmlContent = md.render(markdown).split("\n");

	htmlContent.forEach((line) => {
		line = line.trim();

		if (line.startsWith("- ") || line.match(/^\d+\./)) {
			doc.text(line, { indent: 20 });
		} else if (line.startsWith("<h1>") || line.startsWith("<h2>")) {
			doc.fontSize(18).text(line.replace(/<\/?h[12]>/g, "").trim());
			doc.moveDown();
		} else if (line.startsWith("<h3>") || line.startsWith("<h4>")) {
			doc.fontSize(14).text(line.replace(/<\/?h[34]>/g, "").trim());
			doc.moveDown(0.5);
		} else if (line.startsWith("<p>")) {
			doc.fontSize(12).text(line.replace(/<\/?p>/g, "").trim());
		} else if (line.includes("<img")) {
			const altText = line.match(/alt="(.*?)"/);
			doc.text(altText ? `[Image: ${altText[1]}]` : "[Image]");
		} else {
			doc.text(line);
		}

		doc.moveDown(0.5);
	});

	doc.end();
};

module.exports = { convertMarkdownToPdf, convertMarkdownToPDF };
