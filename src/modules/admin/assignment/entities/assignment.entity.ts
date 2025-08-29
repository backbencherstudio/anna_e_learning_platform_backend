import { Assignment, AssignmentQuestion } from '@prisma/client';

export type AssignmentWithRelations = Assignment & {
    questions?: AssignmentQuestion[];
};
