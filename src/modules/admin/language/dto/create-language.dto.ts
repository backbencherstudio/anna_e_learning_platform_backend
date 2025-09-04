import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateLanguageDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    code: string;
}