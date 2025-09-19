import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { extname } from 'path';

export const multerConfig: MulterOptions = {
    storage: require('multer').memoryStorage(), // Use memory storage to preserve buffer
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
        files: 50, // Maximum 50 files
    },
    fileFilter: (req, file, callback) => {
        // Allow all file types for now, you can add restrictions here
        callback(null, true);
    },
};

export const memoryStorageConfig: MulterOptions = {
    storage: require('multer').memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
        files: 50, // Maximum 50 files
    },
    fileFilter: (req, file, callback) => {
        // Allow all file types for now, you can add restrictions here
        callback(null, true);
    },
};
