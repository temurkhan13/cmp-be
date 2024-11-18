const fs = require("fs");
const { mdToPdf } = require("md-to-pdf");

const cssContent = `
@page {
    margin: 25mm;
}

body {
    font-family: 'Arial', sans-serif;
    color: #4a4a4a;
    line-height: 1.6;
}

h1 {
    text-align: center;
    color: #2c6cd0;
    font-size: 24px;
}

h2 {
    color: #2c6cd0;
    font-size: 20px;
    border-bottom: 1px solid #ddd;
    padding-bottom: 5px;
}

ul {
    list-style-type: circle;
    margin-left: 20px;
}
`;

const convertMarkdownToPDF = async (markdownContent, destPath) => {
	try {
		const options = {
			pdf_options: {
				format: "A4",
				margin: "20mm",
			},
			css: cssContent,
			dest: destPath,
		};

		const pdf = await mdToPdf({ content: markdownContent }, options);

		if (pdf) {
			fs.writeFileSync(destPath, pdf.content);
			console.log(`PDF generated successfully at: ${destPath}`);
		}
	} catch (error) {
		console.error("Error generating PDF:", error);
	}
};

module.exports = {
	convertMarkdownToPDF,
};
