const fs = require("fs");
const marked = require("marked");
const htmlToPdfmake = require("html-to-pdfmake");
const pdfmake = require("pdfmake");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const virtualConsole = new jsdom.VirtualConsole();
const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
	virtualConsole,
});
const window = dom.window;

const styles = {
	h1: {
		fontSize: 24,
		color: "#2c6cd0",
		alignment: "center",
		margin: [0, 0, 0, 10],
	},
	h2: {
		fontSize: 20,
		color: "#2c6cd0",
		margin: [0, 10, 0, 5],
	},
	p: {
		fontSize: 12,
		color: "#4a4a4a",
		lineHeight: 1.6,
		font: "Arial",
	},
	ul: {
		margin: [20, 0, 0, 0],
	},
	li: {
		fontSize: 12,
		color: "#4a4a4a",
		lineHeight: 1.6,
	},
};

const convertMarkdownToPDF = async (markdownContent, destPath) => {
	try {
		const html = marked.parse(markdownContent, {
			gfm: true,
			breaks: true,
			smartLists: true,
		});

		const pdfContent = htmlToPdfmake(html, { window });

		const docDefinition = {
			content: pdfContent,
			styles: styles,
			defaultStyle: {
				font: "Arial",
			},
			pageSize: "A4",
			pageMargins: [56.7, 56.7, 56.7, 56.7],
		};

		const fonts = {
			Arial: {
				normal: "Helvetica",
				bold: "Helvetica-Bold",
				italics: "Helvetica-Oblique",
				bolditalics: "Helvetica-BoldOblique",
			},
		};

		const printer = new pdfmake(fonts);
		const doc = printer.createPdfKitDocument(docDefinition);

		const writeStream = fs.createWriteStream(destPath);
		doc.pipe(writeStream);

		return new Promise((resolve, reject) => {
			writeStream.on("finish", () => {
				console.log(`PDF generated successfully at: ${destPath}`);
				resolve(true);
			});

			writeStream.on("error", (error) => {
				reject(error);
			});

			doc.end();
		});
	} catch (error) {
		console.error("Error generating PDF:", error);
		throw error;
	}
};

const convertMarkdownFileToPDF = async (inputPath, outputPath) => {
	try {
		const markdownContent = fs.readFileSync(inputPath, "utf-8");
		await convertMarkdownToPDF(markdownContent, outputPath);
	} catch (error) {
		console.error("Error reading markdown file:", error);
		throw error;
	}
};

module.exports = {
	convertMarkdownToPDF,
	convertMarkdownFileToPDF,
};
