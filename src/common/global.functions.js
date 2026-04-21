const fs = require("fs");
const { promises: fsPromises } = require("fs");
const axios = require("axios");
const { info, error: _error } = require("../config/logger");

const isArrayWithLength = (arr) => Array.isArray(arr) && arr.length > 0;
const makeAxiosCall = async ({ url, method, data = null, headers = {}, params = {} }) => {
  info(`axios ${method} ${url}`);

  try {
    const response = await axios({
      url,
      method,
      data,
      headers,
      params,
      timeout: 120000, // 2 minute timeout for AI calls
    });

    return response.data;
  } catch (error) {
    _error(`Axios call failed: ${error.message}`);
    throw error;
  }
};
const bearerToken = (token) => {
  if (!token) return;

  return {
    Authorization: `Bearer ${token}`,
  };
};
const parseJsonIfPossible = (obj) => {
  if (!obj) return;
  if (typeof obj === "string") {
    try {
      return JSON.parse(obj);
    } catch {
      return obj;
    }
  }
  return obj;
};
const getURLParams = (paramsObj) => {
  return new URLSearchParams(paramsObj);
};
const capitalize = (value) => {
  if (typeof value !== "string") return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
};
const handleStatus = (status, message, data) => ({ status, message, data: data || null });
const deepMerge = (target, source) => {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      if (!target[key]) {
        target[key] = {};
      }
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
};
const isMarkdownDetected = (text) => {
  if (!text) return false;
  // A real report has multiple markdown headings and substantial length
  // Simple questions with a heading should NOT be treated as reports
  const headingCount = (text.match(/^#{1,3}\s/gm) || []).length;
  return headingCount >= 3 && text.length > 1500;
};
const isValidUrl = (url) => {
  const urlPattern = /^(http|https):\/\/[^ "]+$/;
  return urlPattern.test(url);
};
const removeFileByPath = (filePath) => {
  try {
    fs.unlinkSync(filePath);
    info(`File ${filePath} has been removed successfully.`);
  } catch (err) {
    _error(`Error removing file ${filePath}: ${err.message}`);
  }
};
const isFileExists = async (filePath) => {
  try {
    await fsPromises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  isArrayWithLength,
  makeAxiosCall,
  bearerToken,
  parseJsonIfPossible,
  getURLParams,
  capitalize,
  handleStatus,
  deepMerge,
  isMarkdownDetected,
  isValidUrl,
  removeFileByPath,
  isFileExists,
};
