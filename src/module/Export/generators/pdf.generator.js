const { convertMarkdownToPDF } = require("../../../utils/markdownToPDF");

/**
 * Generate a PDF Buffer from normalized export data.
 * Uses the existing convertMarkdownToPDF utility which accepts markdown strings.
 */
const generate = async (normalized) => {
	return convertMarkdownToPDF(normalized.markdown);
};

module.exports = generate;
