import { IsString, IsNotEmpty } from 'class-validator';

export class AbortChunkUploadDto {
    @IsString()
    @IsNotEmpty()
    fileName: string;
}

