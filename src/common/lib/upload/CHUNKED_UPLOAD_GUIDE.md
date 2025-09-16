# Chunked Upload System for Series Creation

This guide explains how to use the chunked upload system when creating series with large video files.

## Overview

The chunked upload system allows you to upload large video files (up to 2GB) by splitting them into 5MB chunks. This system is particularly useful for:

- Large video lessons (1GB+)
- Unstable network connections
- Resume interrupted uploads
- Progress tracking
- Background processing

## Workflow

### 1. Initialize Upload

First, initialize the upload session:

```http
POST /api/admin/series/upload/initialize
Content-Type: application/json

{
  "fileName": "large-video.mp4",
  "fileSize": 1048576000,
  "mimeType": "video/mp4",
  "totalChunks": 200
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "uploadId": "upload_1234567890_abc123",
    "chunkSize": 5242880
  },
  "message": "Upload initialized successfully"
}
```

### 2. Upload Chunks

Upload each chunk individually:

```http
POST /api/admin/series/upload/chunk
Content-Type: multipart/form-data

Form Data:
- chunk: [binary data]
- uploadId: "upload_1234567890_abc123"
- chunkNumber: 1
- totalChunks: 200
- fileName: "large-video.mp4"
- fileSize: 1048576000
- chunkSize: 5242880
- mimeType: "video/mp4"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "progress": 5,
    "chunkNumber": 1
  },
  "message": "Chunk uploaded successfully"
}
```

### 3. Check Progress

Monitor upload progress:

```http
GET /api/admin/series/upload/progress/{uploadId}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "uploadId": "upload_1234567890_abc123",
    "fileName": "large-video.mp4",
    "totalChunks": 200,
    "uploadedChunks": 150,
    "progress": 75,
    "status": "uploading"
  },
  "message": "Progress retrieved successfully"
}
```

### 4. Finalize Upload

Once all chunks are uploaded, finalize:

```http
POST /api/admin/series/upload/finalize
Content-Type: application/json

{
  "uploadId": "upload_1234567890_abc123",
  "finalFileName": "lesson-1:large-video.mp4"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "fileName": "lesson-1:large-video.mp4"
  },
  "message": "Upload finalized successfully"
}
```

### 5. Create Series with Chunked Uploads

Create the series with the uploaded files:

```http
POST /api/admin/series/create-with-chunks
Content-Type: application/json

{
  "title": "Advanced Video Course",
  "summary": "A course with large video lessons",
  "description": "Learn advanced techniques through detailed video lessons",
  "visibility": "PUBLIC",
  "total_price": 299,
  "course_type": "VIDEO",
  "language_id": "en",
  "courses": [
    {
      "title": "Introduction to Advanced Techniques",
      "position": 0,
      "price": 99,
      "lessons_files": [
        {
          "title": "Introduction Video"
        }
      ]
    }
  ],
  "chunkedUploads": [
    {
      "courseIndex": 0,
      "uploadId": "upload_1234567890_abc123",
      "fileName": "lesson-1:large-video.mp4",
      "lessonTitle": "Introduction Video"
    }
  ]
}
```

## Frontend Implementation

### JavaScript Example

```javascript
class ChunkedUploader {
  constructor() {
    this.chunkSize = 5 * 1024 * 1024; // 5MB
    this.uploadId = null;
  }

  async uploadFile(file, onProgress) {
    try {
      // 1. Initialize upload
      const initResponse = await fetch('/api/admin/series/upload/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          totalChunks: Math.ceil(file.size / this.chunkSize),
        }),
      });

      const { data } = await initResponse.json();
      this.uploadId = data.uploadId;

      // 2. Upload chunks
      const totalChunks = Math.ceil(file.size / this.chunkSize);

      for (let chunkNumber = 1; chunkNumber <= totalChunks; chunkNumber++) {
        const start = (chunkNumber - 1) * this.chunkSize;
        const end = Math.min(start + this.chunkSize, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('uploadId', this.uploadId);
        formData.append('chunkNumber', chunkNumber);
        formData.append('totalChunks', totalChunks);
        formData.append('fileName', file.name);
        formData.append('fileSize', file.size);
        formData.append('chunkSize', this.chunkSize);
        formData.append('mimeType', file.type);

        const response = await fetch('/api/admin/series/upload/chunk', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        if (result.success && onProgress) {
          onProgress(result.data.progress);
        }
      }

      // 3. Finalize upload
      const finalizeResponse = await fetch(
        '/api/admin/series/upload/finalize',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId: this.uploadId,
            finalFileName: file.name,
          }),
        },
      );

      return await finalizeResponse.json();
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  }

  async resumeUpload(uploadId) {
    // Get upload status to see which chunks are missing
    const statusResponse = await fetch(
      `/api/admin/series/upload/status/${uploadId}`,
    );
    const status = await statusResponse.json();

    if (status.success) {
      // Continue uploading missing chunks
      // Implementation similar to uploadFile but only upload missing chunks
    }
  }

  async cancelUpload(uploadId) {
    const response = await fetch(
      `/api/admin/series/upload/cancel/${uploadId}`,
      {
        method: 'DELETE',
      },
    );
    return await response.json();
  }
}

// Usage
const uploader = new ChunkedUploader();

// Upload large video
const fileInput = document.getElementById('videoFile');
const file = fileInput.files[0];

if (file) {
  uploader
    .uploadFile(file, (progress) => {
      console.log(`Upload progress: ${progress}%`);
      // Update progress bar
      document.getElementById('progressBar').style.width = `${progress}%`;
    })
    .then((result) => {
      console.log('Upload completed:', result);
    })
    .catch((error) => {
      console.error('Upload failed:', error);
    });
}
```

### React Component Example

```jsx
import React, { useState } from 'react';

const VideoUploader = () => {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadId, setUploadId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = async (file) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Initialize upload
      const initResponse = await fetch('/api/admin/series/upload/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          totalChunks: Math.ceil(file.size / (5 * 1024 * 1024)),
        }),
      });

      const { data } = await initResponse.json();
      setUploadId(data.uploadId);

      // Upload chunks
      const chunkSize = 5 * 1024 * 1024;
      const totalChunks = Math.ceil(file.size / chunkSize);

      for (let chunkNumber = 1; chunkNumber <= totalChunks; chunkNumber++) {
        const start = (chunkNumber - 1) * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('uploadId', data.uploadId);
        formData.append('chunkNumber', chunkNumber);
        formData.append('totalChunks', totalChunks);
        formData.append('fileName', file.name);
        formData.append('fileSize', file.size);
        formData.append('chunkSize', chunkSize);
        formData.append('mimeType', file.type);

        await fetch('/api/admin/series/upload/chunk', {
          method: 'POST',
          body: formData,
        });

        const progress = Math.round((chunkNumber / totalChunks) * 100);
        setUploadProgress(progress);
      }

      // Finalize upload
      await fetch('/api/admin/series/upload/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: data.uploadId,
          finalFileName: file.name,
        }),
      });

      console.log('Upload completed successfully');
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="video/*"
        onChange={(e) => {
          const file = e.target.files[0];
          if (file) {
            uploadFile(file);
          }
        }}
        disabled={isUploading}
      />

      {isUploading && (
        <div>
          <div>Upload Progress: {uploadProgress}%</div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoUploader;
```

## API Endpoints Reference

### Chunked Upload Endpoints

| Method   | Endpoint                                       | Purpose               |
| -------- | ---------------------------------------------- | --------------------- |
| `POST`   | `/api/admin/series/upload/initialize`          | Initialize new upload |
| `POST`   | `/api/admin/series/upload/chunk`               | Upload single chunk   |
| `POST`   | `/api/admin/series/upload/finalize`            | Finalize upload       |
| `GET`    | `/api/admin/series/upload/progress/{uploadId}` | Get upload progress   |
| `GET`    | `/api/admin/series/upload/status/{uploadId}`   | Get detailed status   |
| `DELETE` | `/api/admin/series/upload/cancel/{uploadId}`   | Cancel upload         |

### Series Creation Endpoints

| Method | Endpoint                               | Purpose                            |
| ------ | -------------------------------------- | ---------------------------------- |
| `POST` | `/api/admin/series/create-with-chunks` | Create series with chunked uploads |
| `POST` | `/api/admin/series`                    | Create series with regular uploads |

## Error Handling

The system handles various error scenarios:

- **Network interruptions**: Resume uploads using status endpoint
- **Invalid file types**: Validation on initialization
- **File size limits**: 2GB maximum
- **Missing chunks**: Validation before finalization
- **Storage errors**: Proper error messages and cleanup

## Best Practices

1. **Always check upload status** before finalizing
2. **Implement retry logic** for failed chunks
3. **Show progress indicators** to users
4. **Handle network interruptions** gracefully
5. **Clean up failed uploads** to free storage space
6. **Validate file types** before starting upload
7. **Use appropriate chunk sizes** (5MB recommended)

## Configuration

### File Size Limits

- Maximum file size: 2GB
- Chunk size: 5MB
- Supported file types: Video, Audio, Documents, Images

### Storage Configuration

Files are stored in the configured storage system (local or S3) under the upload directory structure:

```
uploads/
├── {uploadId}/
│   ├── chunk_1
│   ├── chunk_2
│   └── ...
```

After finalization, files are moved to the lesson file directory with proper naming conventions.
