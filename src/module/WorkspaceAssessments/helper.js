const path = require("path");
const { convertMarkdownToPDF } = require("../../utils/markdownToPDF");
const FNS = require('date-fns');

const generateAndConvertMarkdownToPDF = async (markdownContent) => {
	const fileName = `${Date.now()}_assessment_report.pdf`;
	const filePath = path.resolve(process.cwd(), "public/uploads", fileName);
	await convertMarkdownToPDF(markdownContent, filePath);
	return { fileName, filePath };
};

const getUploadPath = (outputPath) => {
	const PATH = "public/uploads/";
	const directoryPath = path.join(process.cwd(), PATH);
	const filePath = path.join(directoryPath, outputPath);
	return filePath;
};

const generateSafePdfFilename = (title) => {
  const timestamp = FNS.format(new Date(), 'yyyyMMdd-HHmmss');
  const safeTitle = title
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  
  return `${safeTitle}-${timestamp}.pdf`;
};

module.exports = {
	generateAndConvertMarkdownToPDF,
	getUploadPath,
	generateSafePdfFilename,
};
