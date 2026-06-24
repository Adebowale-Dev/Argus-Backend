import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

jest.setTimeout(300000);

let mongo;
let User;
let Question;
let QuestionBank;
let Exam;
let questionBankService;

const requestFor = (user) => ({ user, ip: "127.0.0.1", get: () => "jest" });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ User } = await import("../src/modules/users/user.model.js"));
  ({ Question } = await import("../src/modules/question-bank/question.model.js"));
  ({ QuestionBank } = await import("../src/modules/question-banks/questionBank.model.js"));
  ({ Exam } = await import("../src/modules/exams/exam.model.js"));
  questionBankService = await import("../src/modules/question-banks/questionBank.service.js");
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => mongoose.connection.db.dropDatabase());

describe("question bank deletion", () => {
  test("permanently deletes an unused bank and its questions", async () => {
    const examiner = await User.create({ fullName: "Examiner", email: "examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const bank = await QuestionBank.create({ title: "Unused bank", owner: examiner._id, questionCount: 1 });
    await Question.create({
      questionBank: bank._id, owner: examiner._id, createdBy: examiner._id, questionText: "Select A",
      questionType: "SINGLE_SELECT", options: [{ key: "A", text: "Correct" }, { key: "B", text: "Wrong" }],
      correctAnswer: ["A"], marks: 1,
    });

    const result = await questionBankService.hardDelete(requestFor(examiner), bank.id);

    expect(result.deletedQuestions).toBe(1);
    expect(await QuestionBank.findById(bank.id)).toBeNull();
    expect(await Question.countDocuments({ questionBank: bank._id })).toBe(0);
  });

  test("does not delete a bank used by an exam", async () => {
    const examiner = await User.create({ fullName: "Examiner", email: "examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const bank = await QuestionBank.create({ title: "Used bank", owner: examiner._id });
    await Exam.create({
      title: "Referenced exam", instructions: "Answer every question.", durationMinutes: 30,
      questionBank: bank._id, owner: examiner._id, createdBy: examiner._id,
    });

    await expect(questionBankService.hardDelete(requestFor(examiner), bank.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(await QuestionBank.findById(bank.id)).not.toBeNull();
  });
});
