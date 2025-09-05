export interface CourseFileData {
    courseIndex: number;
    introVideo?: Express.Multer.File;
    endVideo?: Express.Multer.File;
    lessonFiles?: Express.Multer.File[];
}

export const parseCourseFiles = (
    req: any,
    courseCount: number
): CourseFileData[] => {
    const result: CourseFileData[] = [];

    for (let i = 0; i < courseCount; i++) {
        const introKey = `courseFiles[${i}].introVideo`;
        const endKey = `courseFiles[${i}].endVideo`;
        const lessonKey = `courseFiles[${i}].lessonFiles`;

        const courseData: CourseFileData = { courseIndex: i };

        if (req.files[introKey]?.[0]) {
            courseData.introVideo = req.files[introKey][0];
        }

        if (req.files[endKey]?.[0]) {
            courseData.endVideo = req.files[endKey][0];
        }

        if (req.files[lessonKey]) {
            courseData.lessonFiles = req.files[lessonKey];
        }

        result.push(courseData);
    }

    return result;
};
