const logger = require("../../config/logger");

const assignPageAndLayoutIndexes = (arr, pageIndexStep, layoutIndexStep) => {
  arr.forEach((obj, index) => {
    obj.pageIndex = Math.floor(index / pageIndexStep) + 1;
    obj.layoutIndex = (index % layoutIndexStep) + 1;
  });

  arr.sort((a, b) => {
    if (a.pageIndex === b.pageIndex) {
      return a.layoutIndex - b.layoutIndex;
    }
    return a.pageIndex - b.pageIndex;
  });

  return arr;
};

const formatQuestionsToString = (data) => {
  try {
    if (!Array.isArray(data)) throw new Error("Input must be an array");

    return data
      .map((item) => {
        if (!item.question || !item.answer) throw new Error("Missing question or answer");
        return `"question": "${item.question}",\n"answer": "${item.answer}"`;
      })
      .join("\n\n");
  } catch (error) {
    logger.error(error.message);
    return [];
  }
};

module.exports = {
  assignPageAndLayoutIndexes,
  formatQuestionsToString,
};
