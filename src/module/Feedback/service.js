const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const supabase = require("../../config/supabase");
const paginate = require("../../utils/paginate");

const createFeedback = async (body) => {
  const { data, error } = await supabase
    .from("feedback")
    .insert({
      user_id: body.userId,
      rating: body.rating,
      feedback_text: body.feedbackText,
    })
    .select()
    .single();
  if (error) throw error;

  // Insert categories if present
  if (body.category && Array.isArray(body.category)) {
    for (const cat of body.category) {
      const { data: catData, error: catError } = await supabase
        .from("feedback_categories")
        .insert({
          feedback_id: data.id,
          name: cat.name,
        })
        .select()
        .single();
      if (catError) throw catError;

      if (cat.subcategories && Array.isArray(cat.subcategories)) {
        const subs = cat.subcategories.map((sub) => ({
          category_id: catData.id,
          name: sub.name,
          selected: sub.selected || false,
        }));
        const { error: subError } = await supabase.from("feedback_subcategories").insert(subs);
        if (subError) throw subError;
      }
    }
  }

  return data;
};

const queryFeedbacks = async (filter, options) => {
  const mapped = {};
  if (filter.userId) mapped.user_id = filter.userId;
  return paginate("feedback", { filter: mapped, ...options }, supabase);
};

const getFeedbackById = async (feedbackId) => {
  const { data, error } = await supabase.from("feedback").select().eq("id", feedbackId).single();
  if (error) return null;
  return data;
};

const updateFeedbackById = async (feedbackId, body) => {
  const existing = await getFeedbackById(feedbackId);
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "Feedback not found");
  }
  const update = {};
  if (body.rating !== undefined) update.rating = body.rating;
  if (body.feedbackText !== undefined) update.feedback_text = body.feedbackText;
  const { data, error } = await supabase
    .from("feedback")
    .update(update)
    .eq("id", feedbackId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

const deleteFeedbackById = async (feedbackId) => {
  const existing = await getFeedbackById(feedbackId);
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, "Feedback not found");
  }
  const { error } = await supabase.from("feedback").delete().eq("id", feedbackId);
  if (error) throw error;
  return existing;
};

module.exports = {
  createFeedback,
  queryFeedbacks,
  getFeedbackById,
  updateFeedbackById,
  deleteFeedbackById,
};
