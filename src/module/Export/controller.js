const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const ApiError = require("../../utils/ApiError");
const exportService = require("./service");

const CONTENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const exportDocument = catchAsync(async (req, res) => {
  const { type, source, sourceId, options } = req.body;

  const result = await exportService.generate({ type, source, sourceId, options });

  const contentType = CONTENT_TYPES[type];
  if (!contentType) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported export type: ${type}`);
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
  res.send(result.buffer);
});

module.exports = { exportDocument };
