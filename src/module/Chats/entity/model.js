const mongoose = require('mongoose');
const config = require('../../../config/config');
const { toJSON, paginate } = require('../../../utils/plugins');

// Message Schema
const messageSchema = mongoose.Schema({
  text: { type: String, required: true },
  sender: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
  timestamp: { type: Date, default: Date.now },
  pdfPath: {
    type: String,
    default: null,
  },
  user: {
    type: mongoose.Types.ObjectId,
    ref: 'User',
  },
});

const chatSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
    },
    messages: [messageSchema],
  },
  {
    toJSON: {
      transform(doc, ret) {
        // ret.id = ret._id;
        // delete ret._id;
        // delete ret.__v;
        // delete ret.updatedAt;
        if (ret.pdfPath) {
          ret.pdfPath = config.rootPath + ret.pdfPath;
        }
      },
    },
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
chatSchema.plugin(toJSON);
chatSchema.plugin(paginate);

/**
 * @typedef Chat
 */
const Message = mongoose.model('Message', messageSchema);
const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;
