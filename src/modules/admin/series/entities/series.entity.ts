import { Series, Course } from '@prisma/client';

export type SeriesWithRelations = Series & {
    courses?: Course[];
};
