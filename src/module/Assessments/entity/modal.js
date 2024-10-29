const mongoose = require('mongoose');
const config = require('../../../config/config');
const { toJSON, paginate } = require('../../../utils/plugins');

// Message Schema
const messageSchema = mongoose.Schema({
  text: { type: String },
  sender: { type: mongoose.Types.ObjectId, ref: 'User' },
  timestamp: { type: Date, default: Date.now },
  pdfPath: {
    type: String,
    default: null,
  },
  generalInfo: {
    type: String,
    trim: true,
  },
  surveyType: {
    type: String,
    trim: true,
  },
  assessmentName: {
    type: String,
    trim: true,
  },
  checkType: {
    type: String,
    trim: true,
  },
});

const assessmentSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
    },
    messages: [messageSchema],
  },
  {
    // toJSON: {
    //   transform(doc, ret) {
    //     // ret.id = ret._id;
    //     // delete ret._id;
    //     // delete ret.__v;
    //     // delete ret.updatedAt;
    //     if (ret.pdfPath) {
    //       ret.pdfPath = config.rootPath + ret.pdfPath;
    //     }
    //   },
    // },
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
assessmentSchema.plugin(toJSON);
assessmentSchema.plugin(paginate);

/**
 * @typedef Chat
 */
const Assessment = mongoose.model('Assessment', assessmentSchema);

module.exports = Assessment;
