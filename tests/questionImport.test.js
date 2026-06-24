import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import * as XLSX from "xlsx";

jest.setTimeout(300000);

let mongo;
let User;
let QuestionBank;
let questionService;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ User } = await import("../src/modules/users/user.model.js"));
  ({ QuestionBank } = await import("../src/modules/question-banks/questionBank.model.js"));
  questionService = await import("../src/modules/question-bank/question.service.js");
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => mongoose.connection.db.dropDatabase());

describe("question CSV import preview", () => {
  test("accepts spreadsheet-style option columns and comma-separated answers", async () => {
    const examiner = await User.create({ fullName: "Examiner", email: "examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const bank = await QuestionBank.create({ title: "Import bank", owner: examiner._id });
    const csv = [
      "questionType,questionText,optionA,optionB,optionC,optionD,correctAnswer,marks,topic,tags,explanation",
      "MULTIPLE_CHOICE,Select primary colors,Red,Blue,Green,Black,\"A,B\",2,Colors,\"art,basics\",Choose all that apply",
      "TRUE_FALSE,The sun is a star,,,,,A,1,Science,,",
    ].join("\n");
    const req = {
      user: examiner,
      body: {},
      file: { buffer: Buffer.from(csv) },
      get: (header) => header.toLowerCase() === "x-question-bank" ? bank.id : undefined,
    };

    const preview = await questionService.previewBulkImport(req);

    expect(preview).toHaveLength(2);
    expect(preview[0]).toMatchObject({ optionCount: 4, correctAnswer: ["A", "B"], marks: 2 });
    expect(preview[1]).toMatchObject({ optionCount: 2, correctAnswer: ["A"], marks: 1 });
  });

  test("accepts common alias headers from manually edited spreadsheets", async () => {
    const examiner = await User.create({ fullName: "Examiner", email: "alias-examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const bank = await QuestionBank.create({ title: "Alias import bank", owner: examiner._id });
    const csv = [
      "type,question,option1,option2,option3,correct,score,rationale",
      "SINGLE_SELECT,Choose the letter A,Alpha,Beta,Gamma,A,1,Alpha maps to A",
    ].join("\n");
    const req = {
      user: examiner,
      body: {},
      file: { buffer: Buffer.from(csv) },
      get: (header) => header.toLowerCase() === "x-question-bank" ? bank.id : undefined,
    };

    const preview = await questionService.previewBulkImport(req);

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({ optionCount: 3, correctAnswer: ["A"], marks: 1 });
  });

  test("accepts tab-separated text files", async () => {
    const examiner = await User.create({ fullName: "Examiner", email: "tsv-examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const bank = await QuestionBank.create({ title: "TSV import bank", owner: examiner._id });
    const tsv = [
      "type\tquestion\toption1\toption2\tcorrect\tscore",
      "SINGLE_SELECT\tChoose A\tAlpha\tBeta\tA\t1",
    ].join("\n");
    const req = {
      user: examiner,
      body: {},
      file: { buffer: Buffer.from(tsv), originalname: "questions.tsv", mimetype: "text/tab-separated-values" },
      get: (header) => header.toLowerCase() === "x-question-bank" ? bank.id : undefined,
    };

    const preview = await questionService.previewBulkImport(req);

    expect(preview[0]).toMatchObject({ optionCount: 2, correctAnswer: ["A"], marks: 1 });
  });

  test("accepts document-style text with lettered option lines", async () => {
    const examiner = await User.create({ fullName: "Examiner", email: "doc-text-examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const bank = await QuestionBank.create({ title: "Document text bank", owner: examiner._id });
    const text = [
      "Question: What is the capital of France?",
      "A) Paris",
      "B) London",
      "C) Berlin",
      "Answer: A",
      "Marks: 1",
    ].join("\n");
    const req = {
      user: examiner,
      body: {},
      file: { buffer: Buffer.from(text), originalname: "questions.txt", mimetype: "text/plain" },
      get: (header) => header.toLowerCase() === "x-question-bank" ? bank.id : undefined,
    };

    const preview = await questionService.previewBulkImport(req);

    expect(preview[0]).toMatchObject({ optionCount: 3, correctAnswer: ["A"], marks: 1 });
  });

  test("accepts document-style text with inline options", async () => {
    const examiner = await User.create({ fullName: "Examiner", email: "inline-doc-examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const bank = await QuestionBank.create({ title: "Inline document bank", owner: examiner._id });
    const text = [
      "1. What is 2 + 2?",
      "A) 3 B) 4 C) 5 D) 6",
      "Correct: B",
      "Score: 1",
    ].join("\n");
    const req = {
      user: examiner,
      body: {},
      file: { buffer: Buffer.from(text), originalname: "questions.txt", mimetype: "text/plain" },
      get: (header) => header.toLowerCase() === "x-question-bank" ? bank.id : undefined,
    };

    const preview = await questionService.previewBulkImport(req);

    expect(preview[0]).toMatchObject({ optionCount: 4, correctAnswer: ["B"], marks: 1 });
  });

  test("accepts document-style txt files even when the browser sends a generic MIME type", async () => {
    const examiner = await User.create({ fullName: "Examiner", email: "generic-mime-examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const bank = await QuestionBank.create({ title: "Generic MIME bank", owner: examiner._id });
    const text = [
      "Question 1: Which option is correct?",
      "A) Wrong",
      "B) Correct",
      "Answer: B",
      "Marks: 1",
    ].join("\n");
    const req = {
      user: examiner,
      body: {},
      file: { buffer: Buffer.from(text), originalname: "questions.txt", mimetype: "application/octet-stream" },
      get: (header) => header.toLowerCase() === "x-question-bank" ? bank.id : undefined,
    };

    const preview = await questionService.previewBulkImport(req);

    expect(preview[0]).toMatchObject({ optionCount: 2, correctAnswer: ["B"], marks: 1 });
  });

  test("returns a clear error for old Word doc files", async () => {
    const examiner = await User.create({ fullName: "Examiner", email: "old-doc-examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const bank = await QuestionBank.create({ title: "Old doc bank", owner: examiner._id });
    const req = {
      user: examiner,
      body: {},
      file: { buffer: Buffer.from("not a docx"), originalname: "questions.doc", mimetype: "application/msword" },
      get: (header) => header.toLowerCase() === "x-question-bank" ? bank.id : undefined,
    };

    await expect(questionService.previewBulkImport(req)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining(".doc files are not supported"),
    });
  });

  test("accepts compact document text extracted onto one line", async () => {
    const examiner = await User.create({ fullName: "Examiner", email: "compact-doc-examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const bank = await QuestionBank.create({ title: "Compact document bank", owner: examiner._id });
    const text = "Question 1: What is the capital of Nigeria? A) Lagos B) Abuja C) Kano Correct Answer: B Marks: 2";
    const req = {
      user: examiner,
      body: {},
      file: { buffer: Buffer.from(text), originalname: "questions.txt", mimetype: "text/plain" },
      get: (header) => header.toLowerCase() === "x-question-bank" ? bank.id : undefined,
    };

    const preview = await questionService.previewBulkImport(req);

    expect(preview[0]).toMatchObject({ optionCount: 3, correctAnswer: ["B"], marks: 2 });
  });

  test("accepts answer labels without a colon", async () => {
    const examiner = await User.create({ fullName: "Examiner", email: "answer-label-examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const bank = await QuestionBank.create({ title: "Answer label bank", owner: examiner._id });
    const text = [
      "Q1. Which letter comes first?",
      "A. A",
      "B. B",
      "Ans A",
      "Score 1",
    ].join("\n");
    const req = {
      user: examiner,
      body: {},
      file: { buffer: Buffer.from(text), originalname: "questions.txt", mimetype: "text/plain" },
      get: (header) => header.toLowerCase() === "x-question-bank" ? bank.id : undefined,
    };

    const preview = await questionService.previewBulkImport(req);

    expect(preview[0]).toMatchObject({ optionCount: 2, correctAnswer: ["A"], marks: 1 });
  });


  test("accepts Excel xlsx files", async () => {
    const examiner = await User.create({ fullName: "Examiner", email: "xlsx-examiner@argus.test", password: "password1", role: "EXAMINER", status: "ACTIVE" });
    const bank = await QuestionBank.create({ title: "XLSX import bank", owner: examiner._id });
    const worksheet = XLSX.utils.json_to_sheet([
      { type: "SINGLE_SELECT", question: "Choose A", option1: "Alpha", option2: "Beta", correct: "A", score: 1 },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Questions");
    const req = {
      user: examiner,
      body: {},
      file: {
        buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
        originalname: "questions.xlsx",
        mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      get: (header) => header.toLowerCase() === "x-question-bank" ? bank.id : undefined,
    };

    const preview = await questionService.previewBulkImport(req);

    expect(preview[0]).toMatchObject({ optionCount: 2, correctAnswer: ["A"], marks: 1 });
  });
});
