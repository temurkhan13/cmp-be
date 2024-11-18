const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const { toJSON, paginate } = require("../../../utils/plugins");
const { verify } = require("jsonwebtoken");
const config = require("../../../config/config");
const { isValidUrl } = require("../../../common/global.functions");

const userSchema = mongoose.Schema(
	{
		firstName: {
			type: String,
			trim: true,
			default: null,
		},
		lastName: {
			type: String,
			trim: true,
			default: null,
		},
		companyName: {
			type: String,
			trim: true,
			default: null,
		},
		email: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			lowercase: true,
			validate(value) {
				if (!validator.isEmail(value)) {
					throw new Error("Invalid email");
				}
			},
		},
		password: {
			type: String,
			trim: true,
			minlength: 8,
			validate(value) {
				if (value && (!value.match(/\d/) || !value.match(/[a-zA-Z]/))) {
					throw new Error("Password must contain at least one letter and one number");
				}
			},
			private: true, // used by the toJSON plugin
		},
		photoPath: {
			type: String,
			default: null,
		},
		googleId: {
			type: String,
			default: null,
		},
		verificationCode: {
			key: {
				type: Number,
				default: null,
			},
			verify: {
				type: Boolean,
				default: false,
			},
			validTill: {
				type: Date,
				default: null,
			},
		},
		OTP: {
			key: {
				type: Number,
				default: null,
			},
			validTill: {
				type: Date,
				default: null,
			},
		},
		sharedChats: [
			{
				workspaceId: { type: mongoose.Types.ObjectId, ref: "Workspace" },
				folderId: { type: mongoose.Types.ObjectId, ref: "Folder" },
				chatId: { type: mongoose.Types.ObjectId, ref: "Chat" },
			},
		],
		subscription: { type: mongoose.Schema.Types.ObjectId, ref: "UserSubscription", default: null },
	},
	{
		toJSON: {
			transform(doc, ret) {
				if (ret.photoPath) {
					const isUrl = isValidUrl(ret.photoPath);
					if (!isUrl) {
						ret.photoPath = `${config.rootPath}${ret.photoPath}`;
					}
				}
			},
		},
		timestamps: true,
	},
);

// add plugin that converts mongoose to json
userSchema.plugin(toJSON);
userSchema.plugin(paginate);

/**
 * Check if email is taken
 * @param {string} email - The user's email
 * @param {ObjectId} [excludeUserId] - The id of the user to be excluded
 * @returns {Promise<boolean>}
 */
userSchema.statics.isEmailTaken = async function (email) {
	const user = await this.findOne({ email });
	return !!user;
};

/**
 * Check if password matches the user's password
 * @param {string} password
 * @returns {Promise<boolean>}
 */
userSchema.methods.isPasswordMatch = async function (password) {
	const user = this;
	return bcrypt.compare(password, user.password);
};

userSchema.pre("save", function (next) {
	if (!this.googleId && !this.password) {
		throw new Error("Password is required!");
	}
	next();
});

userSchema.pre("save", async function (next) {
	const user = this;
	if (user.isModified("password")) {
		user.password = await bcrypt.hash(user.password, 8);
	}
	next();
});

/**
 * @typedef User
 */
const User = mongoose.model("User", userSchema);

module.exports = User;
