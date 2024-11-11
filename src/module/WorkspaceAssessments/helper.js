const path = require("path");
const { convertMarkdownToPDF } = require("../../utils/markdownToPDF");

const generateAndConvertMarkdownToPDF = (markdownContent) => {
	const fileName = `${Date.now()}_assessment_report.pdf`;
	const filePath = path.resolve(process.cwd(), "public/uploads", fileName);
	convertMarkdownToPDF(markdownContent, filePath);
	return { fileName, filePath };
};

module.exports = {
	generateAndConvertMarkdownToPDF,
};
