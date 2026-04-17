const FNS = require('date-fns');

const generateSafePdfFilename = (title) => {
  const timestamp = FNS.format(new Date(), 'yyyyMMdd-HHmmss');
  const safeTitle = title
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();

  return `${safeTitle}-${timestamp}.pdf`;
};

module.exports = {
	generateSafePdfFilename,
};
