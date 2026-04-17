const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const FNS = require("date-fns");
const workspaceAssessmentService = require("../WorkspaceAssessments/service");
const playbookService = require("../digitalPlaybook/service");
const generators = require("./generators");

const FILE_EXTENSIONS = { pdf: "pdf", docx: "docx", xlsx: "xlsx", pptx: "pptx" };

/**
 * Generate a safe filename from a title and extension.
 */
const generateSafeFilename = (title, extension) => {
	const timestamp = FNS.format(new Date(), "yyyyMMdd-HHmmss");
	const safeTitle = (title || "export")
		.replace(/[^a-zA-Z0-9]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase()
		.substring(0, 60);
	return `${safeTitle}-${timestamp}.${extension}`;
};

/**
 * Strip HTML tags to plain text.
 */
const stripHtml = (html) => {
	if (!html) return "";
	return html.replace(/<[^>]*>/g, "").trim();
};

/**
 * Normalize assessment data into a common export shape.
 * Assessment reports store content as markdown, so sections are parsed from headings.
 */
const normalizeAssessment = (assessment, options) => {
	const report = assessment.report;
	if (!report || !report.content) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Assessment has no report content to export");
	}

	const title = options?.title || report.title || assessment.name || "Assessment Report";
	const markdown = report.content;

	// Parse markdown into sections by splitting on headings
	const lines = markdown.split("\n");
	const sections = [];
	let currentSection = null;

	for (const line of lines) {
		const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
		if (headingMatch) {
			if (currentSection) sections.push(currentSection);
			currentSection = {
				heading: headingMatch[2].trim(),
				level: headingMatch[1].length,
				content: "",
				children: [],
			};
		} else if (currentSection) {
			currentSection.content += (currentSection.content ? "\n" : "") + line;
		} else {
			// Content before any heading — treat as intro
			if (!sections.length && line.trim()) {
				currentSection = { heading: "", level: 0, content: line, children: [] };
			}
		}
	}
	if (currentSection) sections.push(currentSection);

	return {
		title,
		markdown, // preserve original markdown for PDF generator
		metadata: { source: "assessment", sourceId: assessment.id },
		branding: options?.branding || {},
		sections,
	};
};

/**
 * Normalize playbook data into a common export shape.
 */
const normalizePlaybook = (playbook, options) => {
	const title = options?.title || playbook.name || "Digital Playbook";
	const sections = [];

	for (const stage of playbook.stages || []) {
		const section = {
			heading: stage.stage || "",
			level: 1,
			content: "",
			children: [],
		};

		// Stage-level nodeData
		for (const nd of stage.nodeData || []) {
			section.children.push({
				heading: nd.heading || "",
				level: 2,
				content: stripHtml(nd.description || ""),
				children: [],
			});
		}

		// Nodes within stage
		for (const node of stage.nodes || []) {
			const nodeChild = {
				heading: node.heading || "",
				level: 2,
				content: "",
				children: [],
			};

			for (const nd of node.nodeData || []) {
				nodeChild.children.push({
					heading: nd.heading || "",
					level: 3,
					content: stripHtml(nd.description || ""),
					children: [],
				});
			}

			section.children.push(nodeChild);
		}

		sections.push(section);
	}

	// Build markdown representation for the PDF generator
	const markdownLines = [`# ${title}`, ""];
	for (const section of sections) {
		markdownLines.push(`## ${section.heading}`, "");
		for (const child of section.children) {
			markdownLines.push(`### ${child.heading}`, "");
			if (child.content) markdownLines.push(child.content, "");
			for (const grandchild of child.children) {
				markdownLines.push(`#### ${grandchild.heading}`, "");
				if (grandchild.content) markdownLines.push(grandchild.content, "");
			}
		}
	}

	return {
		title,
		markdown: markdownLines.join("\n"),
		metadata: {
			source: "playbook",
			sourceId: playbook.id,
			workspaceName: playbook.workspace_name || "",
		},
		branding: options?.branding || {},
		sections,
	};
};

/**
 * Fetch source data and normalize it.
 */
const fetchAndNormalize = async (source, sourceId, options) => {
	switch (source) {
		case "assessment": {
			const assessment = await workspaceAssessmentService.getWorkspaceAssessmentById(sourceId);
			if (!assessment) {
				throw new ApiError(httpStatus.NOT_FOUND, "Assessment not found");
			}
			return normalizeAssessment(assessment, options);
		}
		case "playbook": {
			const playbook = await playbookService.getSitemap(sourceId);
			if (!playbook) {
				throw new ApiError(httpStatus.NOT_FOUND, "Playbook not found");
			}
			return normalizePlaybook(playbook, options);
		}
		default:
			throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported source: ${source}`);
	}
};

/**
 * Main export generation function.
 */
const generate = async ({ type, source, sourceId, options }) => {
	const normalized = await fetchAndNormalize(source, sourceId, options);
	const generator = generators[type];
	if (!generator) {
		throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported export type: ${type}`);
	}

	const buffer = await generator(normalized);
	const fileName = generateSafeFilename(normalized.title, FILE_EXTENSIONS[type]);

	return { buffer, fileName };
};

module.exports = { generate };
