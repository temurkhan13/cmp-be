const mongoose = require("mongoose");
const { paginate, toJSON } = require("../../../utils/plugins");
const { workspaceAssessment } = require("../../../common/schema");
const { mongoDuplicateKeyError } = require("../../../utils/mongoCustomHandlers");
const Schema = mongoose.Schema;

const reportSchema = new Schema({
	_id: false,
	isGenerated: { type: Boolean, default: false },
	title: { type: String, default: "", trim: true },
	content: { type: String, default: "" },
	url: { type: String, default: "" },
	generatedAt: { type: Date, default: null },
});

const qaSchema = new Schema({
	question: { type: String, trim: true },
	answer: { type: String, trim: true },
	status: {
		type: String,
		enum: ["pending", "answered"],
	},
	askedAt: Date,
	answeredAt: Date,
});

const workspaceAssessmentSchema = new Schema(
	{
		userId: { type: mongoose.Types.ObjectId, ref: "User", required: true, index: true },
		workspaceId: { type: mongoose.Types.ObjectId, ref: "Workspace", required: true, index: true },
		folderId: { type: mongoose.Types.ObjectId, ref: "Folder", required: true, index: true },
		name: { type: String, required: true, enum: Object.values(workspaceAssessment.enums.assessmentNames), index: true },
		status: {
			type: String,
			enum: Object.values(workspaceAssessment.enums.assessmentStatus),
			default: workspaceAssessment.enums.assessmentStatus.PENDING,
		},
		isSoftDeleted: { type: Boolean, default: false },
		report: reportSchema,
		qa: [qaSchema],
	},
	{ timestamps: true },
);

workspaceAssessmentSchema.plugin(toJSON);
workspaceAssessmentSchema.plugin(paginate);

workspaceAssessmentSchema.pre("save", async function (next) {
	if (this.isNew) {
		const assessmentCount = await WorkspaceAssessment.countDocuments({
			folderId: this.folderId,
			isSoftDeleted: false,
		});
		if (assessmentCount >= 24) {
			throw new Error("Folder cannot have more than 24 active assessments");
		}
	}
	next();
});

workspaceAssessmentSchema.index({ folderId: 1, isSoftDeleted: 1 });
workspaceAssessmentSchema.index({ folderId: 1, name: 1 }, { unique: true });

mongoDuplicateKeyError(workspaceAssessmentSchema);

const WorkspaceAssessment = mongoose.model("WorkspaceAssessment", workspaceAssessmentSchema);
module.exports = WorkspaceAssessment;
