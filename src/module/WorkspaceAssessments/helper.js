const { convertMarkdownToPDF } = require("../../utils/markdownToPDF");
const FNS = require('date-fns');
const supabase = require("../../config/supabase");
const logger = require("../../config/logger.js");

const STORAGE_BUCKET = "reports";

/**
 * Generate a PDF from markdown, upload to Supabase Storage, and return the public URL.
 * No local disk writes — safe for ephemeral filesystems (Render, etc.).
 */
const generateAndConvertMarkdownToPDF = async (markdownContent) => {
	const fileName = `${Date.now()}_assessment_report.pdf`;
	const storagePath = `assessments/${fileName}`;

	// Generate PDF as in-memory Buffer
	const pdfBuffer = await convertMarkdownToPDF(markdownContent);

	// Upload to Supabase Storage
	const { data, error } = await supabase.storage
		.from(STORAGE_BUCKET)
		.upload(storagePath, pdfBuffer, {
			contentType: "application/pdf",
			upsert: false,
		});

	if (error) {
		logger.error("Failed to upload PDF to Supabase Storage:", error);
		throw new Error(`Supabase Storage upload failed: ${error.message}`);
	}

	// Get public URL
	const { data: urlData } = supabase.storage
		.from(STORAGE_BUCKET)
		.getPublicUrl(storagePath);

	return { fileName, publicUrl: urlData.publicUrl, storagePath };
};

/**
 * Remove a PDF from Supabase Storage by its storage path.
 */
const removeStorageFile = async (storagePath) => {
	if (!storagePath) return;
	try {
		const { error } = await supabase.storage
			.from(STORAGE_BUCKET)
			.remove([storagePath]);
		if (error) {
			logger.error("Failed to remove file from Supabase Storage:", error);
		}
	} catch (err) {
		logger.error("Error removing storage file:", err);
	}
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
	removeStorageFile,
	generateSafePdfFilename,
};
