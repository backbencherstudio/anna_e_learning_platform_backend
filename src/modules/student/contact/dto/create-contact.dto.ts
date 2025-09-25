import { IsOptional, IsString, IsEmail, IsDateString } from 'class-validator';

export class CreateContactDto {
    @IsOptional()
    @IsString()
    first_name?: string;

    @IsOptional()
    @IsString()
    last_name?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    phone_number?: string;

    @IsOptional()
    @IsString()
    whatsapp_number?: string;

    @IsOptional()
    @IsString()
    reason?: string;

    @IsOptional()
    @IsString()
    message?: string;

    @IsOptional()
    @IsDateString()
    date?: string;
}
