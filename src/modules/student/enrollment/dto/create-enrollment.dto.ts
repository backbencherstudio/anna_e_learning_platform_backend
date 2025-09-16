import { IsString, IsNotEmpty, IsNumber, IsOptional, IsIn } from 'class-validator';

export class CreateEnrollmentDto {
    @IsString()
    @IsOptional()
    user_id!: string;

    @IsString()
    @IsNotEmpty()
    series_id!: string;

    @IsOptional()
    @IsNumber()
    amount?: number;

    @IsOptional()
    @IsString()
    @IsIn(['usd', 'eur', 'gbp'])
    currency?: string = 'usd';
}


