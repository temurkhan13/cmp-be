const httpStatus = require("http-status");
const path = require("path");
const ApiError = require("../../utils/ApiError");
const supabase = require("../../config/supabase");
const config = require("../../config/config");
const { convertMarkdownToPDF } = require("../../utils/markdownToPDF");
const { makeAxiosCall, isArrayWithLength } = require("../../common/global.functions");
const logger = require("../../config/logger");
const { formatQuestionsToString } = require("./helper");

// ─── Assessment CRUD ─────────────────────────────────────────────

const createAssessment = async (workspaceId, folderId, body) => {
  try {
    // Get workspace userId
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("user_id")
      .eq("id", workspaceId)
      .single();
    if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

    const apiBody = {
      user_id: workspace.user_id,
      chat_id: folderId,
      message: body.message || "",
      general_info: body.generalInfo || "",
      business_info: body.business_info || "",
      assessment_name: body.assessmentName,
    };

    const gptURL = `${config.baseUrl}/assesment-chat`;
    const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: apiBody });
    const nextQuestion = gptResponse.message;

    // Create assessment
    const { data: assessment, error: assessErr } = await supabase
      .from("folder_assessments")
      .insert({
        folder_id: folderId,
        name: body.name,
        version: 1,
      })
      .select()
      .single();
    if (assessErr) throw new ApiError(httpStatus.BAD_REQUEST, assessErr.message);

    // Everything after the assessment insert is wrapped for compensating rollback
    try {
      // Create report
      const { data: report } = await supabase
        .from("folder_assessment_reports")
        .insert({
          assessment_id: assessment.id,
          report_title: "Initial Assessment Report",
        })
        .select()
        .single();

      // Create sub-report
      const { data: subReport } = await supabase
        .from("folder_assessment_sub_reports")
        .insert({
          report_id: report.id,
          report_title: body.assessmentName,
        })
        .select()
        .single();

      // Create first QA entry
      await supabase.from("folder_assessment_sub_report_qa").insert({
        sub_report_id: subReport.id,
        question: nextQuestion,
        answer: "",
      });

      const markdownPattern = /(```|#\s|-\s|\*\*|_\s|>\s)/;
      const containsMarkdown = markdownPattern.test(nextQuestion);
      let isReportGenerated = false;

      if (containsMarkdown) {
        const pdfFileName = `${Date.now()}_initial_assessment_report.pdf`;
        const pdfFilePath = path.resolve(process.cwd(), "public/uploads", pdfFileName);
        convertMarkdownToPDF(nextQuestion, pdfFilePath);

        await supabase
          .from("folder_assessment_reports")
          .update({
            final_report: nextQuestion,
            final_report_url: `/uploads/${pdfFileName}`,
            is_report_generated: true,
          })
          .eq("id", report.id);

        isReportGenerated = true;
      } else {
        // Add another QA entry for the next question
        await supabase.from("folder_assessment_sub_report_qa").insert({
          sub_report_id: subReport.id,
          question: nextQuestion,
          answer: "",
        });
      }

      // Insert media/documents if present
      if (isArrayWithLength(body.media)) {
        const mediaRows = body.media.map((m) => ({
          assessment_id: assessment.id,
          file_name: m.name || m.fileName,
          url: m.url,
        }));
        await supabase.from("folder_assessment_media").insert(mediaRows);
      }
      if (isArrayWithLength(body.documents)) {
        const docRows = body.documents.map((d) => ({
          assessment_id: assessment.id,
          file_name: d.name || d.fileName,
          name: d.name,
          date: d.date || null,
          size: d.size || null,
        }));
        await supabase.from("folder_assessment_documents").insert(docRows);
      }

      // Return full assessment object
      const result = { ...assessment, text: nextQuestion, isReportGenerated };
      return result;
    } catch (_innerErr) {
      // Compensating write: clean up the orphaned assessment row
      try {
        await supabase.from("folder_assessments").delete().eq("id", assessment.id);
      } catch (cleanupErr) {
        logger.error(`Failed to rollback assessment ${assessment.id}: ${cleanupErr.message}`);
      }
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to initialize assessment"
      );
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.BAD_REQUEST, `Error creating assessment: ${error.message}`);
  }
};

const updateAssessment = async (workspaceId, folderId, assessmentId, subReportId, updateBody) => {
  try {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("user_id")
      .eq("id", workspaceId)
      .single();
    if (!workspace)
      throw new ApiError(httpStatus.BAD_REQUEST, "Workspace, Folder, or Assessment not found!");

    const { data: assessment } = await supabase
      .from("folder_assessments")
      .select("id, name")
      .eq("id", assessmentId)
      .single();
    if (!assessment) throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");

    // Get the sub-report
    const { data: subReport } = await supabase
      .from("folder_assessment_sub_reports")
      .select("id, report_title, report_id")
      .eq("id", subReportId)
      .single();
    if (!subReport) throw new ApiError(httpStatus.BAD_REQUEST, "Sub-report not found!");

    // Get all QA for this sub-report, update the last one with the answer
    const { data: qaItems } = await supabase
      .from("folder_assessment_sub_report_qa")
      .select("*")
      .eq("sub_report_id", subReportId)
      .order("created_at", { ascending: true });

    if (!isArrayWithLength(qaItems)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "No questionAnswer items found in this assessment."
      );
    }

    const lastQA = qaItems[qaItems.length - 1];
    await supabase
      .from("folder_assessment_sub_report_qa")
      .update({
        answer: updateBody.content,
      })
      .eq("id", lastQA.id);

    // Build history from all QA
    const textMessages = ["", ...qaItems.flatMap((qa) => [qa.question, qa.answer])];

    const apiBody = {
      user_id: workspace.user_id,
      chat_id: assessmentId,
      message: updateBody.content,
      history: textMessages,
      general_info: "",
      business_info: "",
      assessment_name: subReport.report_title,
    };

    const gptURL = `${config.baseUrl}/assesment-chat`;
    const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: apiBody });

    if (!gptResponse) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Error making API call to GPT!");
    }

    const markdownPattern = /(```|#\s|-\s|\*\*|_\s|>\s)/;
    const containsMarkdown = markdownPattern.test(gptResponse.message);
    const nextQuestion = gptResponse.message;

    if (containsMarkdown) {
      const pdfFileName = `${Date.now()}_assessment_report.pdf`;
      const pdfFilePath = path.resolve(process.cwd(), "public/uploads", pdfFileName);
      convertMarkdownToPDF(gptResponse.message, pdfFilePath);

      // Get current report to create sub-report from previous
      const { data: report } = await supabase
        .from("folder_assessment_reports")
        .select("*")
        .eq("id", subReport.report_id)
        .single();

      if (report && report.final_report) {
        await supabase.from("folder_assessment_sub_reports").insert({
          report_id: report.id,
          final_sub_report: report.final_report,
          final_sub_report_url: report.final_report_url,
          report_title: "Previous Assessment Report",
        });
      }

      await supabase
        .from("folder_assessment_reports")
        .update({
          final_report: gptResponse.message,
          final_report_url: `/uploads/${pdfFileName}`,
          is_report_generated: true,
          report_title: gptResponse.title || report?.report_title,
        })
        .eq("id", subReport.report_id);
    } else {
      // Store next question
      await supabase.from("folder_assessment_sub_report_qa").insert({
        sub_report_id: subReportId,
        question: nextQuestion,
        answer: "",
      });
    }

    // Handle media/documents
    if (isArrayWithLength(updateBody.media)) {
      const mediaRows = updateBody.media.map((m) => ({
        assessment_id: assessmentId,
        file_name: m.name || m.fileName,
        url: m.url,
      }));
      await supabase.from("folder_assessment_media").insert(mediaRows);
    }
    if (isArrayWithLength(updateBody.documents)) {
      const docRows = updateBody.documents.map((d) => ({
        assessment_id: assessmentId,
        file_name: d.name || d.fileName,
        name: d.name,
        date: d.date || null,
        size: d.size || null,
      }));
      await supabase.from("folder_assessment_documents").insert(docRows);
    }

    return {
      success: true,
      question: { content: nextQuestion, timestamp: new Date() },
      text: nextQuestion,
      isReportGenerated: containsMarkdown,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.BAD_REQUEST, `Error storing user response: ${error.message}`);
  }
};

const getAssessment = async (workspaceId, folderId, assessmentId) => {
  try {
    const { data: assessment } = await supabase
      .from("folder_assessments")
      .select(
        `
				*,
				reports:folder_assessment_reports(
					*,
					sub_reports:folder_assessment_sub_reports(
						*,
						question_answer:folder_assessment_sub_report_qa(*)
					)
				)
			`
      )
      .eq("id", assessmentId)
      .eq("folder_id", folderId)
      .single();
    if (!assessment) throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");
    if (assessment.is_soft_deleted)
      throw new ApiError(httpStatus.NOT_FOUND, "Assessment is soft-deleted and not available.");
    return assessment;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.BAD_REQUEST, `Error retrieving assessment: ${error.message}`);
  }
};

const deleteAssessment = async (workspaceId, folderId, assessmentId) => {
  try {
    const { data: assessment } = await supabase
      .from("folder_assessments")
      .select("id, is_soft_deleted")
      .eq("id", assessmentId)
      .eq("folder_id", folderId)
      .single();
    if (!assessment) throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");

    if (assessment.is_soft_deleted) {
      // Clean up media, documents, and links (no FK cascade since constraint was dropped)
      await supabase.from("folder_assessment_media").delete().eq("assessment_id", assessmentId);
      await supabase.from("folder_assessment_documents").delete().eq("assessment_id", assessmentId);
      await supabase.from("folder_assessment_links").delete().eq("assessment_id", assessmentId);

      await supabase.from("folder_assessments").delete().eq("id", assessmentId);
      return { success: true, message: "Assessment permanently deleted" };
    } else {
      await supabase
        .from("folder_assessments")
        .update({ is_soft_deleted: true })
        .eq("id", assessmentId);
      return { success: true, message: "Assessment soft deleted" };
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.BAD_REQUEST, `Error deleting assessment: ${error.message}`);
  }
};

// ─── Business Info CRUD ──────────────────────────────────────────

const createBusinessInfo = async (workspaceId, folderId, body) => {
  try {
    const { data: folder } = await supabase
      .from("folders")
      .select("id")
      .eq("id", folderId)
      .eq("workspace_id", workspaceId)
      .single();
    if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

    const { data, error } = await supabase
      .from("folder_business_info")
      .insert({
        folder_id: folderId,
        company_size: body.companySize,
        company_name: body.companyName,
        job_title: body.jobTitle,
        industry: body.industry,
        role: body.role,
        user_name: body.userName,
      })
      .select()
      .single();
    if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

    return { success: true, message: "Business information created successfully", data };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error creating business information: ${error.message}`
    );
  }
};

const getBusinessInfo = async (workspaceId, folderId, businessInfoId) => {
  try {
    const { data } = await supabase
      .from("folder_business_info")
      .select("*")
      .eq("id", businessInfoId)
      .eq("folder_id", folderId)
      .single();
    if (!data) throw new ApiError(httpStatus.NOT_FOUND, "Business information not found!");
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error retrieving business information: ${error.message}`
    );
  }
};

const updateBusinessInfo = async (workspaceId, folderId, businessInfoId, body) => {
  try {
    const mapped = {};
    if (body.companySize !== undefined) mapped.company_size = body.companySize;
    if (body.companyName !== undefined) mapped.company_name = body.companyName;
    if (body.jobTitle !== undefined) mapped.job_title = body.jobTitle;
    if (body.industry !== undefined) mapped.industry = body.industry;
    if (body.role !== undefined) mapped.role = body.role;
    if (body.userName !== undefined) mapped.user_name = body.userName;

    const { data, error } = await supabase
      .from("folder_business_info")
      .update(mapped)
      .eq("id", businessInfoId)
      .eq("folder_id", folderId)
      .select()
      .single();
    if (error || !data)
      throw new ApiError(httpStatus.BAD_REQUEST, "Business information not found!");

    return { success: true, message: "Business information updated successfully", data };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error updating business information: ${error.message}`
    );
  }
};

const deleteBusinessInfo = async (workspaceId, folderId, businessInfoId) => {
  try {
    const { error } = await supabase
      .from("folder_business_info")
      .delete()
      .eq("id", businessInfoId)
      .eq("folder_id", folderId);
    if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);
    return { success: true, message: "Business information deleted successfully" };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error deleting business information: ${error.message}`
    );
  }
};

// ─── Survey Info CRUD ────────────────────────────────────────────

const createSurveyInfo = async (workspaceId, folderId, surveyInfoArray) => {
  try {
    const { data: folder } = await supabase
      .from("folders")
      .select("id")
      .eq("id", folderId)
      .eq("workspace_id", workspaceId)
      .single();
    if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

    const rows = surveyInfoArray.map((s) => ({
      folder_id: folderId,
      question: s.question,
      answer: s.answer,
    }));

    const { data, error } = await supabase.from("folder_survey_info").insert(rows).select();
    if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

    return { success: true, message: "Survey information created successfully", data };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error creating survey information: ${error.message}`
    );
  }
};

const getSurveyInfo = async (workspaceId, folderId) => {
  try {
    const { data: folder } = await supabase
      .from("folders")
      .select("id")
      .eq("id", folderId)
      .eq("workspace_id", workspaceId)
      .single();
    if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

    const { data } = await supabase
      .from("folder_survey_info")
      .select("*")
      .eq("folder_id", folderId);

    if (!data || data.length === 0)
      throw new ApiError(httpStatus.NOT_FOUND, "Survey information not found!");
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error retrieving survey information: ${error.message}`
    );
  }
};

const updateSurveyInfo = async (workspaceId, folderId, body) => {
  try {
    const { data: folder } = await supabase
      .from("folders")
      .select("id")
      .eq("id", folderId)
      .eq("workspace_id", workspaceId)
      .single();
    if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

    // Delete existing and re-insert
    await supabase.from("folder_survey_info").delete().eq("folder_id", folderId);

    const rows = body.map((s) => ({
      folder_id: folderId,
      question: s.question,
      answer: s.answer,
    }));

    const { data, error } = await supabase.from("folder_survey_info").insert(rows).select();
    if (error) throw new ApiError(httpStatus.BAD_REQUEST, error.message);

    return { success: true, message: "Survey information updated successfully", data };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error updating survey information: ${error.message}`
    );
  }
};

const deleteSurveyInfo = async (workspaceId, folderId) => {
  try {
    const { data: folder } = await supabase
      .from("folders")
      .select("id")
      .eq("id", folderId)
      .eq("workspace_id", workspaceId)
      .single();
    if (!folder) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace or Folder not found!");

    await supabase.from("folder_survey_info").delete().eq("folder_id", folderId);
    return { success: true, message: "Survey information deleted successfully" };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Error deleting survey information: ${error.message}`
    );
  }
};

// ─── Assessment Report Generation ────────────────────────────────

const generateAssessmentReport = async (workspaceId, folderId, assessmentId) => {
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("user_id")
    .eq("id", workspaceId)
    .single();
  if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace not found!");

  const { data: assessment } = await supabase
    .from("folder_assessments")
    .select("id, name")
    .eq("id", assessmentId)
    .eq("folder_id", folderId)
    .single();
  if (!assessment) throw new ApiError(httpStatus.BAD_REQUEST, "Assessment not found!");

  // Get report and sub-report title
  const { data: report } = await supabase
    .from("folder_assessment_reports")
    .select("id, report_title, folder_assessment_sub_reports(report_title)")
    .eq("assessment_id", assessmentId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const assessmentTitle =
    report?.folder_assessment_sub_reports?.[0]?.report_title || assessment.name;

  // Get survey & business info for the folder
  const { data: surveyInfo } = await supabase
    .from("folder_survey_info")
    .select("*")
    .eq("folder_id", folderId);
  const { data: businessInfo } = await supabase
    .from("folder_business_info")
    .select("*")
    .eq("folder_id", folderId);

  const surveyInfoToString = formatQuestionsToString(surveyInfo || []);

  const reportPayload = {
    user_id: workspace.user_id,
    chat_id: assessmentId,
    assessment_name: assessmentTitle,
    general_info: surveyInfoToString,
    business_info: businessInfo || [],
  };

  const gptURL = `${config.baseUrl}/generate_all_report`;
  const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: reportPayload });
  if (!gptResponse)
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Error generating assessment report");

  const pdfFileName = `${Date.now()}_assessment_report.pdf`;
  const pdfFilePath = path.resolve(process.cwd(), "public/uploads", pdfFileName);
  convertMarkdownToPDF(gptResponse.message, pdfFilePath);

  await supabase
    .from("folder_assessment_reports")
    .update({
      report_title: gptResponse.title,
      final_report: gptResponse.message,
      final_report_url: `/uploads/${pdfFileName}`,
    })
    .eq("id", report.id);

  return {
    success: true,
    message: "Assessment report generated successfully",
    report: {
      ReportTitle: gptResponse.title,
      finalReport: gptResponse.message,
      finalReportURL: `${config.rootPath}/${pdfFileName}`,
    },
  };
};

const generateAssessmentReports = async (workspaceId, folderId) => {
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("user_id")
    .eq("id", workspaceId)
    .single();
  if (!workspace) throw new ApiError(httpStatus.BAD_REQUEST, "Workspace not found!");

  const { data: assessments } = await supabase
    .from("folder_assessments")
    .select("id, name")
    .eq("folder_id", folderId);
  if (!isArrayWithLength(assessments))
    throw new ApiError(httpStatus.BAD_REQUEST, "Assessments not found!");

  const { data: surveyInfo } = await supabase
    .from("folder_survey_info")
    .select("*")
    .eq("folder_id", folderId);
  const { data: businessInfo } = await supabase
    .from("folder_business_info")
    .select("*")
    .eq("folder_id", folderId);
  const surveyInfoToString = formatQuestionsToString(surveyInfo || []);

  for (const assessment of assessments) {
    const { data: report } = await supabase
      .from("folder_assessment_reports")
      .select("id, folder_assessment_sub_reports(report_title)")
      .eq("assessment_id", assessment.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const assessmentTitle = report?.folder_assessment_sub_reports?.[0]?.report_title;
    if (!assessmentTitle) continue;

    const reportPayload = {
      user_id: workspace.user_id,
      chat_id: assessment.id,
      assessment_name: assessmentTitle,
      general_info: surveyInfoToString,
      business_info: businessInfo || [],
    };

    const gptURL = `${config.baseUrl}/generate_all_report`;
    const gptResponse = await makeAxiosCall({ url: gptURL, method: "POST", data: reportPayload });
    if (!gptResponse) break;

    const pdfFileName = `${Date.now()}_assessment_report.pdf`;
    const pdfFilePath = path.resolve(process.cwd(), "public/uploads", pdfFileName);
    convertMarkdownToPDF(gptResponse.message, pdfFilePath);

    await supabase
      .from("folder_assessment_reports")
      .update({
        report_title: gptResponse.title,
        final_report: gptResponse.message,
        final_report_url: `/uploads/${pdfFileName}`,
      })
      .eq("id", report.id);
  }

  return {
    success: true,
    message: "Assessment reports generated successfully",
    data: assessments,
  };
};

// ─── User Aggregation: Assessments ──────────────────────────────

const getUserAssessments = async (userId, query) => {
  let folderQuery = supabase.from("folders").select("id, workspace_id");

  if (query.workspaceId) {
    folderQuery = folderQuery.eq("workspace_id", query.workspaceId);
  } else {
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id")
      .eq("user_id", userId);
    if (!workspaces || workspaces.length === 0)
      throw new ApiError(httpStatus.NOT_FOUND, "No workspaces found for this user");
    folderQuery = folderQuery.in(
      "workspace_id",
      workspaces.map((w) => w.id)
    );
  }
  if (query.folderId) folderQuery = folderQuery.eq("id", query.folderId);

  const { data: folders } = await folderQuery;
  if (!folders || folders.length === 0) return [];

  const folderIds = folders.map((f) => f.id);
  const folderMap = {};
  folders.forEach((f) => {
    folderMap[f.id] = f;
  });

  const { data: assessments } = await supabase
    .from("workspace_assessments")
    .select("*")
    .in("folder_id", folderIds)
    .eq("is_soft_deleted", false);

  return (assessments || []).map((a) => ({
    workspaceId: folderMap[a.folder_id]?.workspace_id,
    folderId: a.folder_id,
    ...a,
  }));
};

module.exports = {
  createAssessment,
  updateAssessment,
  getAssessment,
  deleteAssessment,
  createBusinessInfo,
  getBusinessInfo,
  updateBusinessInfo,
  deleteBusinessInfo,
  createSurveyInfo,
  getSurveyInfo,
  updateSurveyInfo,
  deleteSurveyInfo,
  generateAssessmentReport,
  generateAssessmentReports,
  getUserAssessments,
};
