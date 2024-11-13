const mongoDuplicateKeyError = (schema) => {
	schema.post("save", function (error, doc, next) {
		if (error.name === "MongoError" && error.code === 11000) {
			const duplicateFields = Object.keys(error.keyValue)
				.map((field) => `${field}: ${error.keyValue[field]}`)
				.join(", ");
			next(new Error(`Duplicate fields: (${duplicateFields}). These values already exist.`));
		} else {
			next(error);
		}
	});
};

const mongoValidationErrorHandler = (schema) => {
	schema.post("save", function (error, doc, next) {
		if (error.name === "ValidationError") {
			const errors = {};

			Object.keys(error.errors).forEach((field) => {
				errors[field] = error.errors[field].message;
			});

			next(new Error(`Validation failed: ${Object.keys(errors).join(", ")}`));
		} else {
			next(error);
		}
	});
};

module.exports = { mongoDuplicateKeyError, mongoValidationErrorHandler };
