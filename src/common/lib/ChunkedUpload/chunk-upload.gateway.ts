import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

export interface ChunkUploadProgress {
    uploadId: string;
    progress: number;
    totalChunks: number;
    uploadedChunks: number;
    fileName: string;
    fileSize: number;
    chunkSize: number;
    estimatedTimeRemaining?: number;
}

@WebSocketGateway({
    cors: { origin: "*", methods: ["GET", "POST"] },
    namespace: '/chunk-upload',
    pingInterval: 25000,
    pingTimeout: 60000,
})
export class ChunkUploadGateway {
    @WebSocketServer() server: Server;
    private readonly logger = new Logger(ChunkUploadGateway.name);

    /**
     * Send progress update to specific upload room
     */
    sendProgressUpdate(uploadId: string, progress: ChunkUploadProgress) {
        this.logger.log(
            `📊 [${uploadId}] Progress: ${progress.progress}% | ` +
            `${progress.uploadedChunks}/${progress.totalChunks} chunks | ` +
            `${progress.fileName}`
        );

        this.server.to(`upload-${uploadId}`).emit('upload-progress', progress);
    }

    /**
     * Send chunk completion notification
     */
    sendChunkComplete(uploadId: string, chunkIndex: number, totalChunks: number) {
        const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        this.logger.debug(`Chunk ${chunkIndex + 1}/${totalChunks} completed (${progress}%)`);

        this.server.to(`upload-${uploadId}`).emit('chunk-complete', {
            uploadId,
            chunkIndex,
            totalChunks,
            progress
        });
    }

    /**
     * Send upload completion notification
     */
    sendUploadComplete(uploadId: string, fileName: string, fileSize: number) {
        this.logger.log(
            `✅ [${uploadId}] Upload Complete | ` +
            `File: ${fileName} | ` +
            `Size: ${Math.round(fileSize / 1024 / 1024)}MB`
        );

        this.server.to(`upload-${uploadId}`).emit('upload-complete', {
            uploadId,
            fileName,
            fileSize,
            completedAt: new Date().toISOString()
        });
    }

    /**
     * Send upload error notification
     */
    sendUploadError(uploadId: string, error: string) {
        this.logger.error(
            `❌ [${uploadId}] Upload Failed | Error: ${error}`
        );

        this.server.to(`upload-${uploadId}`).emit('upload-error', {
            uploadId,
            error,
            failedAt: new Date().toISOString()
        });
    }

    /**
     * Handle client joining upload room
     */
    @SubscribeMessage('join-upload')
    handleJoinUpload(@MessageBody() data: { uploadId: string }, @ConnectedSocket() client: Socket) {
        this.logger.debug(`Client ${client.id} joined upload room: ${data.uploadId}`);
        client.join(`upload-${data.uploadId}`);

        return { success: true, message: `Joined upload room for ${data.uploadId}` };
    }

    /**
     * Handle client leaving upload room
     */
    @SubscribeMessage('leave-upload')
    handleLeaveUpload(@MessageBody() data: { uploadId: string }, @ConnectedSocket() client: Socket) {
        this.logger.debug(`Client ${client.id} leaving upload room: upload-${data.uploadId}`);
        client.leave(`upload-${data.uploadId}`);
    }

    /**
     * Ping handler to keep connection alive
     */
    @SubscribeMessage('ping')
    handlePing(@ConnectedSocket() client: Socket) {
        client.emit('pong', {});
    }

    /**
     * Handle new client connections
     */
    handleConnection(client: Socket) {
        this.logger.debug(`✅ WebSocket client connected: ${client.id}`);
    }

    /**
     * Handle client disconnections
     */
    handleDisconnect(client: Socket) {
        this.logger.debug(`❌ WebSocket client disconnected: ${client.id}`);
    }
}
