export interface ModuleFileData {
    moduleIndex: number;
    introVideo?: Express.Multer.File;
    endVideo?: Express.Multer.File;
    lessonFiles?: Express.Multer.File[];
}

export const parseModuleFiles = (
    req: any,
    moduleCount: number
): ModuleFileData[] => {
    const result: ModuleFileData[] = [];

    for (let i = 0; i < moduleCount; i++) {
        const introKey = `moduleFiles[${i}].introVideo`;
        const endKey = `moduleFiles[${i}].endVideo`;
        const lessonKey = `moduleFiles[${i}].lessonFiles`;

        const moduleData: ModuleFileData = { moduleIndex: i };

        if (req.files[introKey]?.[0]) {
            moduleData.introVideo = req.files[introKey][0];
        }

        if (req.files[endKey]?.[0]) {
            moduleData.endVideo = req.files[endKey][0];
        }

        if (req.files[lessonKey]) {
            moduleData.lessonFiles = req.files[lessonKey];
        }

        result.push(moduleData);
    }

    return result;
};
