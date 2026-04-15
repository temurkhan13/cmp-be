const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const ALLOWED_EXTENSIONS = /\.(jpg|jpeg|png|gif|pdf|docx|doc|txt|csv|xlsx|pptx|mp4)$/i;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!file.originalname.match(ALLOWED_EXTENSIONS)) {
    req.fileValidationError = 'File type not allowed';
    return cb(new Error('File type not allowed. Accepted: jpg, png, gif, pdf, docx, txt, csv, xlsx, pptx, mp4'), false);
  }
  cb(null, true);
};

const fileUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

const imageFilter = (req, file, cb) => {
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif|mp4)$/i)) {
    req.fileValidationError = 'Only image files are allowed!';
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

module.exports = {
  fileUpload,
  imageFilter,
};
