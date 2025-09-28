import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { extname } from 'path';

export const multerConfig: MulterOptions = {
    storage: require('multer').memoryStorage(), // Use memory storage to preserve buffer
    limits: {
        fileSize: 5 * 1024 * 1024 * 1024, // 5GB limit for large files
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

// Enhanced multer config for large files (500MB - 5GB)
export const largeFileMulterConfig: MulterOptions = {
    storage: require('multer').memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 * 1024, // 5GB limit
        files: 2, // Max 2 files (video + doc)
        fieldSize: 10 * 1024 * 1024, // 10MB field size
    },
    fileFilter: (req, file, callback) => {
        // Allow video and document files
        const allowedTypes = [
            'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm',
            'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain', 'application/rtf'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            callback(null, true);
        } else {
            callback(new Error(`File type ${file.mimetype} not allowed`), false);
        }
    },
};
