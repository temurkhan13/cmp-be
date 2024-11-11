/* eslint-disable no-unused-vars */
const axios = require("axios");
const { ObjectId } = require("mongodb");
const { info, error: _error } = require("../config/logger");

const isArrayWithLength = (arr) => Array.isArray(arr) && arr.length > 0;
const makeAxiosCall = async ({ url, method, data = null, headers = {}, params = {} }) => {
	info(`sending axios request to url: ${url}`);
	info(`sending axios request with method: ${method}`);
	info(`sending axios request with data: ${JSON.stringify(data)}`);
	info(`sending axios request with headers: ${JSON.stringify(headers)}`);
	info(`sending axios request with params: ${JSON.stringify(params)}`);

	try {
		const response = await axios({
			url,
			method,
			data,
			headers,
			params,
		});

		return response.data;
	} catch (error) {
		_error(error);
	}
};
const bearerToken = (token) => {
	if (!token) return;

	return {
		Authorization: `Bearer ${token}`,
	};
};
const createMongoDoc = (doc) => {
	if (!doc) return;

	const docObj = doc.toObject();
	const { _id, createAt, updatedAt, ...rest } = docObj;

	return rest;
};
const ObjectID = (idStr) => {
	try {
		return ObjectId.createFromHexString(idStr);
	} catch (error) {
		return null;
	}
};
const parseJsonIfPossible = (obj) => {
	if (!obj) return;
	if (typeof obj === "string") {
		const parsedObj = JSON.parse(obj);
		return parsedObj;
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
	const markdownPattern = /(```|#\s|-\s|\*\*|_\s|>\s)/;
	return markdownPattern.test(text);
};

module.exports = {
	isArrayWithLength,
	makeAxiosCall,
	bearerToken,
	createMongoDoc,
	ObjectID,
	parseJsonIfPossible,
	getURLParams,
	capitalize,
	handleStatus,
	deepMerge,
	isMarkdownDetected,
};
