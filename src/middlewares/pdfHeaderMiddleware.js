const pdfHeaderMiddleware = (req, res, next) => {
	res.setPdfHeaders = (fileName) => {
		res.setHeader("Content-Type", "application/pdf");
		res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
	};
	next();
};

module.exports = {
	pdfHeaderMiddleware,
};
