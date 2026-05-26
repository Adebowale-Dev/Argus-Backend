import { beforeAll, afterAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

jest.setTimeout(300000);
jest.unstable_mockModule("../src/config/queue.js", () => ({ scheduleExpiry: jest.fn(), scheduleReminder: jest.fn() }));

let mongo;
let User;
let Course;
let Question;
let Exam;
let attemptService;
let antiCheatService;
let userService;

const requestFor = (user) => ({ user, ip: "127.0.0.1", get: () => "jest" });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ User } = await import("../src/modules/users/user.model.js"));
  ({ Course } = await import("../src/modules/courses/course.model.js"));
  ({ Question } = await import("../src/modules/question-bank/question.model.js"));
  ({ Exam } = await import("../src/modules/exams/exam.model.js"));
  attemptService = await import("../src/modules/attempts/attempt.service.js");
  antiCheatService = await import("../src/modules/anti-cheat/antiCheat.service.js");
  userService = await import("../src/modules/users/user.service.js");
});
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
beforeEach(async () => mongoose.connection.db.dropDatabase());

describe("roles, attempts and anti-cheat", () => {
  test("prevents a sub-admin from creating another sub-admin", async () => {
    const actor = await User.create({ fullName: "Sub Admin", email: "sub@argus.test", password: "password1", role: "SUB_ADMIN", permissions: ["MANAGE_USERS"], status: "ACTIVE" });
    await expect(userService.createUser(requestFor(actor), { fullName: "Another Admin", email: "sub2@argus.test", password: "password1", role: "SUB_ADMIN", permissions: [] })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("limits sub-admin user visibility and actions to delegated target roles", async () => {
    const actor = await User.create({ fullName: "Candidate Admin", email: "delegated@argus.test", password: "password1", role: "SUB_ADMIN", permissions: ["MANAGE_CANDIDATES", "BLOCK_USERS"], status: "ACTIVE" });
    const examiner = await User.create({ fullName: "Examiner", email: "hidden-examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const candidate = await User.create({ fullName: "Candidate", email: "managed-candidate@argus.test", password: "password1", role: "CANDIDATE", status: "ACTIVE" });

    const listed = await userService.listUsers(actor, {});
    expect(listed.data.map((item) => item.email)).toEqual(["managed-candidate@argus.test"]);
    await expect(userService.getUser(actor, examiner.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(userService.setBlocked(requestFor(actor), examiner.id, true, "Not delegated")).rejects.toMatchObject({ statusCode: 403 });
    await userService.setBlocked(requestFor(actor), candidate.id, true, "Permitted");
    expect((await User.findById(candidate.id)).status).toBe("BLOCKED");
  });

  test("sanitizes candidate questions, grades submission and auto-submits violations", async () => {
    const examiner = await User.create({ fullName: "Examiner", email: "examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const candidate = await User.create({ fullName: "Candidate", email: "candidate@argus.test", password: "password1", role: "CANDIDATE", status: "ACTIVE" });
    const course = await Course.create({ title: "Software Quality", code: "SQT101", department: new mongoose.Types.ObjectId(), createdBy: examiner._id, examiners: [examiner._id], candidates: [candidate._id] });
    const question = await Question.create({ course: course._id, createdBy: examiner._id, questionText: "Select A", questionType: "SINGLE_SELECT", options: [{ key: "A", text: "Correct" }, { key: "B", text: "Wrong" }], correctAnswer: ["A"], marks: 5 });
    const exam = await Exam.create({
      title: "Midterm", code: "MID101", course: course._id, createdBy: examiner._id, durationMinutes: 30,
      startTime: new Date(Date.now() - 60000), endTime: new Date(Date.now() + 3600000), questions: [question._id],
      totalMarks: 5, passMark: 3, assignedCandidates: [candidate._id], status: "ACTIVE", maxAttempts: 2,
      showResultImmediately: true, antiCheatSettings: { maxTabSwitches: 2, maxFullscreenExits: 2, maxWindowBlurEvents: 2, maxRefreshAttempts: 2, autoSubmitViolationScore: 2, warningViolationScore: 1, finalWarningViolationScore: 2, maxAwaySeconds: 10 }
    });
    const req = requestFor(candidate);
    const started = await attemptService.start(req, exam.id, {});
    expect(started.questions[0].correctAnswer).toBeUndefined();
    await attemptService.saveAnswer(req, started.attempt.id, { questionId: question.id, answer: ["A"] });
    const submitted = await attemptService.submit(req, started.attempt.id, {});
    expect(submitted.score).toBe(5);
    await expect(attemptService.submit(req, started.attempt.id, {})).rejects.toMatchObject({ statusCode: 409 });

    const second = await attemptService.start(req, exam.id, {});
    const autoSubmitted = await antiCheatService.logEvent(req, second.attempt.id, { eventType: "TAB_SWITCHED" });
    expect(autoSubmitted.action).toBe("AUTO_SUBMIT");
    expect(autoSubmitted.attemptStatus).toBe("AUTO_SUBMITTED");
  });
});
