const { convertMarkdownToPDF } = require("../../../utils/markdownToPDF");

/**
 * Generate a PDF Buffer from normalized export data.
 * Passes title for the cover page.
 */
const generate = async (normalized) => {
	return convertMarkdownToPDF(normalized.markdown, {
		title: normalized.title,
		coverPage: true,
	});
};

module.exports = generate;
