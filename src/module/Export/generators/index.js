const pdfGenerator = require("./pdf.generator");
const docxGenerator = require("./docx.generator");
const xlsxGenerator = require("./xlsx.generator");
const pptxGenerator = require("./pptx.generator");

module.exports = {
	pdf: pdfGenerator,
	docx: docxGenerator,
	xlsx: xlsxGenerator,
	pptx: pptxGenerator,
};
