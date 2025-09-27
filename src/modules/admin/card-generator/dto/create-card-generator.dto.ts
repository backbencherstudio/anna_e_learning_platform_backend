import { IsString, IsOptional, IsEmail, IsNotEmpty } from 'class-validator';

export class CreateCardGeneratorDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsNotEmpty()
    message: string;

    @IsString()
    @IsOptional()
    image: string;

    @IsString()
    @IsOptional()
    recipient_name?: string;

    @IsEmail()
    @IsOptional()
    recipient_email?: string;

    @IsString()
    @IsOptional()
    sender_name?: string;

    @IsString()
    @IsNotEmpty()
    student_id: string;
}
