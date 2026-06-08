import { User } from "../modules/users/user.model.js";
import { QuestionBank } from "../modules/question-banks/questionBank.model.js";
import { Question } from "../modules/question-bank/question.model.js";
import { ROLES } from "../constants/roles.js";

export const seedSampleData = async (admin) => {
  const examiner = await User.create({
    fullName: "Stephen Adebowale",
    email: "examiner@gmail.com",
    username: "examiner",
    password: "123456789",
    role: ROLES.EXAMINER,
    status: "ACTIVE",
    isEmailVerified: true,
    mustChangePassword: false,
    createdBy: admin._id,
  });

  const bank = await QuestionBank.create({
    title: "Mathematics",
    description: "This is the question bank for mathematics",
    owner: examiner._id,
    tags: ["Differentiation"],
    visibility: "PRIVATE",
    status: "ACTIVE",
  });

  const questions = [
    {
      questionBank: bank._id,
      owner: examiner._id,
      createdBy: examiner._id,
      questionText: "What is the derivative of x^2?",
      questionType: "SINGLE_SELECT",
      options: [
        { key: "A", text: "2x" },
        { key: "B", text: "x" },
        { key: "C", text: "x^3" },
        { key: "D", text: "2" },
      ],
      correctAnswer: ["A"],
      marks: 1,
      topic: "Differentiation",
      tags: ["calculus", "intro"],
      explanation: "The derivative of x squared is 2x.",
      status: "ACTIVE",
    },
    {
      questionBank: bank._id,
      owner: examiner._id,
      createdBy: examiner._id,
      questionText: "Select the functions whose derivative is 1.",
      questionType: "MULTIPLE_CHOICE",
      options: [
        { key: "A", text: "x" },
        { key: "B", text: "x + 5" },
        { key: "C", text: "x^2" },
        { key: "D", text: "7x" },
      ],
      correctAnswer: ["A", "B"],
      marks: 2,
      topic: "Differentiation",
      tags: ["calculus", "multiple-choice"],
      explanation: "Both x and x + 5 differentiate to 1.",
      status: "ACTIVE",
    },
    {
      questionBank: bank._id,
      owner: examiner._id,
      createdBy: examiner._id,
      questionText: "The derivative of a constant is zero.",
      questionType: "TRUE_FALSE",
      options: [
        { key: "A", text: "True" },
        { key: "B", text: "False" },
      ],
      correctAnswer: ["A"],
      marks: 1,
      topic: "Differentiation",
      tags: ["calculus", "true-false"],
      explanation: "Constants do not change, so their derivative is zero.",
      status: "ACTIVE",
    },
  ];

  await Question.insertMany(questions);
  await QuestionBank.findByIdAndUpdate(bank._id, { questionCount: questions.length });
};
