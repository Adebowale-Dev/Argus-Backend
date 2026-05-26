import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env.js";

const bearer = [{ bearerAuth: [] }];
const id = (name, description) => ({ in: "path", name, required: true, description, schema: { type: "string" } });
const pagination = [
  { in: "query", name: "page", schema: { type: "integer", default: 1, minimum: 1 } },
  { in: "query", name: "limit", schema: { type: "integer", default: 10, minimum: 1, maximum: 100 } },
  { in: "query", name: "search", schema: { type: "string" } },
  { in: "query", name: "status", schema: { type: "string" } },
  { in: "query", name: "sort", schema: { type: "string", default: "-createdAt" } }
];
const response = (description) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponse" } } }
});
const jsonBody = (schema) => ({
  required: true,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } }
});
const list = (tag, summary, parameters = pagination) => ({
  tags: [tag], summary, security: bearer, parameters, responses: { 200: response("List retrieved successfully.") }
});
const secured = (tag, summary, status = 200) => ({
  tags: [tag], summary, security: bearer, responses: { [status]: response("Operation completed successfully.") }
});

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "ARGUS Backend API",
      version: "1.0.0",
      description: "Online CBT platform API with role-based administration, examination management, server-side grading, live monitoring and anti-cheat auto-submit controls."
    },
    servers: [{ url: `${env.SERVER_URL}${env.API_PREFIX}`, description: "ARGUS API V1" }],
    tags: [
      { name: "Auth", description: "Authentication, sessions and password recovery." },
      { name: "Users", description: "User lifecycle and administrative account controls." },
      { name: "Departments", description: "Academic department management." },
      { name: "Courses", description: "Course assignment and ownership management." },
      { name: "Questions", description: "Examiner question-bank and asset operations." },
      { name: "Exams", description: "Exam authoring, scheduling and candidate assignment." },
      { name: "Candidate Exams", description: "Candidate assigned-exam discovery." },
      { name: "Attempts", description: "Timed exam-taking, autosave, submission and results." },
      { name: "Anti-Cheat", description: "Violation events, evidence capture and monitoring reports." },
      { name: "Reports", description: "Dashboard and downloadable results reporting." },
      { name: "Audit Logs", description: "Administrative accountability records." },
      { name: "Settings", description: "Platform and anti-cheat operational settings." }
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Use the access token returned by login or refresh." }
      },
      schemas: {
        ApiResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Operation completed successfully." },
            data: { type: "object", additionalProperties: true },
            meta: { $ref: "#/components/schemas/PaginationMeta" }
          }
        },
        ApiError: {
          type: "object",
          properties: { success: { type: "boolean", example: false }, message: { type: "string" }, errors: { type: "array", items: { type: "object" } } }
        },
        PaginationMeta: {
          type: "object",
          properties: { page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" } }
        },
        LoginRequest: {
          type: "object", required: ["email", "password"],
          properties: { email: { type: "string", format: "email", example: "admin@gmail.com" }, password: { type: "string", format: "password", example: "123456789" } }
        },
        ForgotPasswordRequest: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } },
        ResetPasswordRequest: { type: "object", required: ["token", "password"], properties: { token: { type: "string" }, password: { type: "string", format: "password", minLength: 8 } } },
        ChangePasswordRequest: { type: "object", required: ["currentPassword", "newPassword"], properties: { currentPassword: { type: "string", format: "password" }, newPassword: { type: "string", format: "password", minLength: 8 } } },
        CreateUserRequest: {
          type: "object", required: ["fullName", "email", "password", "role"],
          properties: {
            fullName: { type: "string" }, email: { type: "string", format: "email" }, username: { type: "string" }, password: { type: "string", format: "password", minLength: 8 },
            role: { type: "string", enum: ["SUPER_ADMIN", "SUB_ADMIN", "EXAMINER", "CANDIDATE"] },
            permissions: { type: "array", items: { type: "string" } }, department: { type: "string" }
          }
        },
        UpdateUserRequest: { type: "object", properties: { fullName: { type: "string" }, username: { type: "string" }, department: { type: "string", nullable: true }, permissions: { type: "array", items: { type: "string" } } } },
        RoleRequest: { type: "object", required: ["role"], properties: { role: { type: "string", enum: ["SUPER_ADMIN", "SUB_ADMIN", "EXAMINER", "CANDIDATE"] }, permissions: { type: "array", items: { type: "string" } } } },
        BlockRequest: { type: "object", required: ["reason"], properties: { reason: { type: "string" } } },
        TemporaryPasswordRequest: { type: "object", required: ["temporaryPassword"], properties: { temporaryPassword: { type: "string", format: "password", minLength: 8 } } },
        DepartmentRequest: { type: "object", required: ["name", "code"], properties: { name: { type: "string" }, code: { type: "string" }, description: { type: "string" }, status: { type: "string", enum: ["ACTIVE", "INACTIVE"] } } },
        CourseRequest: { type: "object", required: ["title", "code", "department"], properties: { title: { type: "string" }, code: { type: "string" }, description: { type: "string" }, department: { type: "string" }, examiners: { type: "array", items: { type: "string" } }, candidates: { type: "array", items: { type: "string" } } } },
        QuestionRequest: {
          type: "object", required: ["course", "questionText", "questionType", "options", "correctAnswer"],
          properties: {
            course: { type: "string" }, questionText: { type: "string" }, questionType: { type: "string", enum: ["MULTIPLE_CHOICE", "TRUE_FALSE", "SINGLE_SELECT"] },
            options: { type: "array", items: { type: "object", properties: { key: { type: "string" }, text: { type: "string" } } } },
            correctAnswer: { type: "array", items: { type: "string" } }, marks: { type: "number" }, difficulty: { type: "string", enum: ["EASY", "MEDIUM", "HARD"] }, topic: { type: "string" }, explanation: { type: "string" }
          }
        },
        AntiCheatSettings: {
          type: "object",
          properties: {
            requireFullscreen: { type: "boolean" }, detectTabSwitch: { type: "boolean" }, detectWindowBlur: { type: "boolean" }, requireWebcam: { type: "boolean" },
            captureSnapshots: { type: "boolean" }, captureScreenshots: { type: "boolean" }, maxTabSwitches: { type: "integer" }, maxFullscreenExits: { type: "integer" },
            maxWindowBlurEvents: { type: "integer" }, maxRefreshAttempts: { type: "integer" }, autoSubmitViolationScore: { type: "integer" }, warningViolationScore: { type: "integer" },
            finalWarningViolationScore: { type: "integer" }, maxAwaySeconds: { type: "integer" }
          }
        },
        ExamRequest: {
          type: "object", required: ["title", "code", "course", "durationMinutes", "startTime", "endTime", "questions", "passMark"],
          properties: {
            title: { type: "string" }, code: { type: "string" }, course: { type: "string" }, description: { type: "string" }, instructions: { type: "string" },
            durationMinutes: { type: "integer" }, startTime: { type: "string", format: "date-time" }, endTime: { type: "string", format: "date-time" }, questions: { type: "array", items: { type: "string" } },
            passMark: { type: "number" }, assignedCandidates: { type: "array", items: { type: "string" } }, randomizeQuestions: { type: "boolean" }, randomizeOptions: { type: "boolean" },
            showResultImmediately: { type: "boolean" }, maxAttempts: { type: "integer" }, antiCheatSettings: { $ref: "#/components/schemas/AntiCheatSettings" }
          }
        },
        CandidateAssignmentRequest: { type: "object", required: ["candidateIds"], properties: { candidateIds: { type: "array", items: { type: "string" } } } },
        StartAttemptRequest: { type: "object", properties: { deviceInfo: { type: "object", additionalProperties: true }, browserFingerprint: { type: "string" } } },
        SaveAnswerRequest: { type: "object", required: ["questionId"], properties: { questionId: { type: "string" }, answer: { type: "array", items: { type: "string" } }, currentQuestionIndex: { type: "integer" } } },
        HeartbeatRequest: { type: "object", properties: { currentQuestionIndex: { type: "integer" } } },
        SubmitAttemptRequest: { type: "object", properties: { answers: { type: "array", items: { $ref: "#/components/schemas/SaveAnswerRequest" } } } },
        AntiCheatEventRequest: {
          type: "object", required: ["eventType"],
          properties: { eventType: { type: "string", example: "TAB_SWITCHED" }, description: { type: "string" }, questionIndex: { type: "integer" }, timeRemaining: { type: "number" }, metadata: { type: "object", additionalProperties: true }, deviceInfo: { type: "object", additionalProperties: true } }
        },
        SettingRequest: { type: "object", required: ["value"], properties: { value: {}, description: { type: "string" }, isPublic: { type: "boolean" } } }
      },
      responses: {
        Unauthorized: { description: "Authentication required.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
        Forbidden: { description: "Insufficient role or permission.", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } }
      }
    },
    paths: {
      "/auth/login": { post: { tags: ["Auth"], summary: "Authenticate a user", requestBody: jsonBody("LoginRequest"), responses: { 200: response("Login successful."), 401: { $ref: "#/components/responses/Unauthorized" } } } },
      "/auth/logout": { post: { ...secured("Auth", "Log out and invalidate the refresh session"), responses: { 200: response("Logout successful.") } } },
      "/auth/refresh-token": { post: { tags: ["Auth"], summary: "Rotate refresh cookie and issue a new access token", responses: { 200: response("Token refreshed."), 401: { $ref: "#/components/responses/Unauthorized" } } } },
      "/auth/me": { get: secured("Auth", "Get the authenticated user") },
      "/auth/forgot-password": { post: { tags: ["Auth"], summary: "Request password-reset email", requestBody: jsonBody("ForgotPasswordRequest"), responses: { 200: response("Reset request accepted.") } } },
      "/auth/reset-password": { post: { tags: ["Auth"], summary: "Reset password using a reset token", requestBody: jsonBody("ResetPasswordRequest"), responses: { 200: response("Password reset.") } } },
      "/auth/change-password": { post: { ...secured("Auth", "Change authenticated user's password"), requestBody: jsonBody("ChangePasswordRequest") } },

      "/users": { get: list("Users", "List users"), post: { ...secured("Users", "Create a managed user account", 201), requestBody: jsonBody("CreateUserRequest") } },
      "/users/{id}": { get: { ...secured("Users", "Get a user"), parameters: [id("id", "User ID")] }, patch: { ...secured("Users", "Update a user"), parameters: [id("id", "User ID")], requestBody: jsonBody("UpdateUserRequest") }, delete: { ...secured("Users", "Soft-delete a user"), parameters: [id("id", "User ID")] } },
      "/users/{id}/block": { patch: { ...secured("Users", "Block a user account"), parameters: [id("id", "User ID")], requestBody: jsonBody("BlockRequest") } },
      "/users/{id}/unblock": { patch: { ...secured("Users", "Unblock a user account"), parameters: [id("id", "User ID")] } },
      "/users/{id}/role": { patch: { ...secured("Users", "Change a user's role and permissions"), parameters: [id("id", "User ID")], requestBody: jsonBody("RoleRequest") } },
      "/users/{id}/password-reset": { patch: { ...secured("Users", "Assign a temporary password"), parameters: [id("id", "User ID")], requestBody: jsonBody("TemporaryPasswordRequest") } },

      "/departments": { get: list("Departments", "List departments"), post: { ...secured("Departments", "Create a department", 201), requestBody: jsonBody("DepartmentRequest") } },
      "/departments/{id}": { get: { ...secured("Departments", "Get a department"), parameters: [id("id", "Department ID")] }, patch: { ...secured("Departments", "Update a department"), parameters: [id("id", "Department ID")], requestBody: jsonBody("DepartmentRequest") }, delete: { ...secured("Departments", "Deactivate a department"), parameters: [id("id", "Department ID")] } },
      "/courses": { get: list("Courses", "List courses"), post: { ...secured("Courses", "Create a course", 201), requestBody: jsonBody("CourseRequest") } },
      "/courses/{id}": { get: { ...secured("Courses", "Get a course"), parameters: [id("id", "Course ID")] }, patch: { ...secured("Courses", "Update a course"), parameters: [id("id", "Course ID")], requestBody: jsonBody("CourseRequest") }, delete: { ...secured("Courses", "Deactivate a course"), parameters: [id("id", "Course ID")] } },

      "/questions": { get: list("Questions", "List question-bank items"), post: { ...secured("Questions", "Create a question", 201), requestBody: jsonBody("QuestionRequest") } },
      "/questions/bulk-import": { post: { ...secured("Questions", "Bulk import questions from JSON or CSV", 201), requestBody: { content: { "application/json": { schema: { type: "object", properties: { questions: { type: "array", items: { $ref: "#/components/schemas/QuestionRequest" } } } } }, "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } } } } } },
      "/questions/{id}": { get: { ...secured("Questions", "Get a question-bank item"), parameters: [id("id", "Question ID")] }, patch: { ...secured("Questions", "Update a question"), parameters: [id("id", "Question ID")], requestBody: jsonBody("QuestionRequest") }, delete: { ...secured("Questions", "Deactivate a question"), parameters: [id("id", "Question ID")] } },
      "/questions/{id}/attachments": { post: { ...secured("Questions", "Upload a question attachment", 201), parameters: [id("id", "Question ID")], requestBody: { content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } } } } } } },

      "/exams": { get: list("Exams", "List accessible exams"), post: { ...secured("Exams", "Create a draft exam", 201), requestBody: jsonBody("ExamRequest") } },
      "/exams/{id}": { get: { ...secured("Exams", "Get an exam"), parameters: [id("id", "Exam ID")] }, patch: { ...secured("Exams", "Update a draft exam"), parameters: [id("id", "Exam ID")], requestBody: jsonBody("ExamRequest") }, delete: { ...secured("Exams", "Archive an exam"), parameters: [id("id", "Exam ID")] } },
      "/exams/{id}/publish": { post: { ...secured("Exams", "Publish a draft exam"), parameters: [id("id", "Exam ID")] } },
      "/exams/{id}/close": { post: { ...secured("Exams", "Close an exam"), parameters: [id("id", "Exam ID")] } },
      "/exams/{id}/assign-candidates": { post: { ...secured("Exams", "Assign candidates to an exam"), parameters: [id("id", "Exam ID")], requestBody: jsonBody("CandidateAssignmentRequest") } },
      "/exams/{id}/candidates": { get: { ...secured("Exams", "List assigned candidates"), parameters: [id("id", "Exam ID")] } },

      "/candidate/exams": { get: list("Candidate Exams", "List assigned candidate exams") },
      "/candidate/exams/{examId}/instructions": { get: { ...secured("Candidate Exams", "Get assigned exam instructions"), parameters: [id("examId", "Exam ID")] } },
      "/exams/{examId}/start": { post: { ...secured("Attempts", "Start an eligible assigned exam", 201), parameters: [id("examId", "Exam ID")], requestBody: jsonBody("StartAttemptRequest") } },
      "/attempts/{attemptId}": { get: { ...secured("Attempts", "Get attempt state"), parameters: [id("attemptId", "Attempt ID")] } },
      "/attempts/{attemptId}/save-answer": { post: { ...secured("Attempts", "Save or update an attempt answer"), parameters: [id("attemptId", "Attempt ID")], requestBody: jsonBody("SaveAnswerRequest") } },
      "/attempts/{attemptId}/heartbeat": { post: { ...secured("Attempts", "Record attempt heartbeat"), parameters: [id("attemptId", "Attempt ID")], requestBody: jsonBody("HeartbeatRequest") } },
      "/attempts/{attemptId}/submit": { post: { ...secured("Attempts", "Submit and grade an attempt"), parameters: [id("attemptId", "Attempt ID")], requestBody: jsonBody("SubmitAttemptRequest") } },
      "/attempts/{attemptId}/result": { get: { ...secured("Attempts", "Get candidate result when enabled"), parameters: [id("attemptId", "Attempt ID")] } },

      "/attempts/{attemptId}/anti-cheat/log": { post: { ...secured("Anti-Cheat", "Record candidate anti-cheat event", 201), parameters: [id("attemptId", "Attempt ID")], requestBody: jsonBody("AntiCheatEventRequest") } },
      "/attempts/{attemptId}/anti-cheat/logs": { get: { ...list("Anti-Cheat", "List attempt anti-cheat logs"), parameters: [id("attemptId", "Attempt ID"), ...pagination] } },
      "/attempts/{attemptId}/snapshot": { post: { ...secured("Anti-Cheat", "Upload private webcam snapshot evidence", 201), parameters: [id("attemptId", "Attempt ID")], requestBody: { content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } } } } } } },
      "/attempts/{attemptId}/screenshot": { post: { ...secured("Anti-Cheat", "Upload private screenshot evidence", 201), parameters: [id("attemptId", "Attempt ID")], requestBody: { content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } } } } } } },
      "/exams/{examId}/anti-cheat/reports": { get: { ...list("Anti-Cheat", "Get exam anti-cheat report or CSV export"), parameters: [id("examId", "Exam ID"), ...pagination, { in: "query", name: "format", schema: { type: "string", enum: ["json", "csv"] } }] } },
      "/anti-cheat/logs/{logId}/evidence-url": { get: { ...secured("Anti-Cheat", "Generate a signed private evidence URL"), parameters: [id("logId", "Anti-cheat log ID")] } },

      "/reports/dashboard": { get: secured("Reports", "Get role-scoped dashboard statistics") },
      "/reports/exams/{examId}/results": { get: { ...list("Reports", "Get exam results or CSV export"), parameters: [id("examId", "Exam ID"), ...pagination, { in: "query", name: "format", schema: { type: "string", enum: ["json", "csv"] } }] } },
      "/reports/exams/{examId}/anti-cheat/export": { get: { ...secured("Reports", "Download anti-cheat report CSV"), parameters: [id("examId", "Exam ID")], responses: { 200: { description: "CSV report.", content: { "text/csv": { schema: { type: "string" } } } } } } },
      "/audit-logs": { get: list("Audit Logs", "List audit records") },
      "/audit-logs/{id}": { get: { ...secured("Audit Logs", "Get an audit record"), parameters: [id("id", "Audit log ID")] } },
      "/settings": { get: list("Settings", "List platform settings", [{ in: "query", name: "category", schema: { type: "string" } }, ...pagination]) },
      "/settings/{key}": { patch: { ...secured("Settings", "Update an operational setting"), parameters: [{ in: "path", name: "key", required: true, schema: { type: "string" } }], requestBody: jsonBody("SettingRequest") } }
    }
  },
  apis: []
});
