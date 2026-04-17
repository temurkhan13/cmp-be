const PptxGenJS = require("pptxgenjs");

const BRAND_COLOR = "00316F";
const ACCENT_COLOR = "C3E11D";

/**
 * Generate a PPTX Buffer from normalized export data.
 */
const generate = async (normalized) => {
	const pptx = new PptxGenJS();
	pptx.layout = "LAYOUT_WIDE";

	const accentColor = (normalized.branding?.accentColor || `#${ACCENT_COLOR}`).replace("#", "");

	// Cover slide
	const cover = pptx.addSlide();
	cover.addText(normalized.metadata?.source === "playbook" ? "DIGITAL PLAYBOOK" : "ASSESSMENT REPORT", {
		x: 0,
		y: 1.5,
		w: "100%",
		fontSize: 12,
		color: "888888",
		align: "center",
	});
	cover.addText(normalized.title, {
		x: 0.5,
		y: 2.2,
		w: "90%",
		fontSize: 32,
		color: BRAND_COLOR,
		align: "center",
		bold: true,
	});
	cover.addShape(pptx.ShapeType.line, {
		x: 5.5,
		y: 3.8,
		w: 2.5,
		h: 0,
		line: { color: accentColor, width: 3 },
	});
	cover.addText("Powered by ChangeAI", {
		x: 0,
		y: 4.2,
		w: "100%",
		fontSize: 9,
		color: "AAAAAA",
		align: "center",
	});

	// Content slides — one per top-level section
	for (const section of normalized.sections) {
		const slide = pptx.addSlide();
		slide.addText(section.heading || "", {
			x: 0.5,
			y: 0.3,
			w: "90%",
			fontSize: 24,
			color: BRAND_COLOR,
			bold: true,
		});

		let yPos = 1.0;

		// Flatten section content + children for the slide
		const items = [];
		if (section.content) {
			items.push({ heading: null, content: section.content, bold: false });
		}
		for (const child of section.children || []) {
			if (child.heading) {
				items.push({ heading: child.heading, content: null, bold: true });
			}
			if (child.content) {
				items.push({ heading: null, content: child.content, bold: false });
			}
			for (const grandchild of child.children || []) {
				if (grandchild.heading) {
					items.push({ heading: grandchild.heading, content: null, bold: true });
				}
				if (grandchild.content) {
					items.push({ heading: null, content: grandchild.content, bold: false });
				}
			}
		}

		for (const item of items) {
			if (yPos > 6.5) break;

			if (item.heading) {
				slide.addText(item.heading, {
					x: 0.5,
					y: yPos,
					w: "90%",
					fontSize: 14,
					color: "333333",
					bold: true,
				});
				yPos += 0.4;
			}

			if (item.content) {
				const text = item.content.substring(0, 500);
				slide.addText(text, {
					x: 0.7,
					y: yPos,
					w: "85%",
					fontSize: 10,
					color: "555555",
					breakLine: true,
				});
				yPos += 0.6;
			}
		}
	}

	// pptxgenjs write returns a Buffer in Node.js when using 'nodebuffer' type
	return pptx.write({ outputType: "nodebuffer" });
};

module.exports = generate;
