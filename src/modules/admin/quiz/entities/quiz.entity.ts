import { Quiz, QuizQuestion, QuestionAnswer } from '@prisma/client';

export type QuizWithRelations = Quiz & {
    questions?: QuizQuestionWithAnswers[];
};

export type QuizQuestionWithAnswers = QuizQuestion & {
    answers?: QuestionAnswer[];
};
