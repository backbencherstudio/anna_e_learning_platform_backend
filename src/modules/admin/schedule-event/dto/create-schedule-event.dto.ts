import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";
import { ScheduleStatus, ScheduleType } from "@prisma/client";

export class CreateScheduleEventDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  class_link?: string;

  @IsDateString()
  start_at!: string;

  @IsDateString()
  end_at!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;

  @IsOptional()
  @IsEnum(ScheduleType)
  type?: ScheduleType;

  @IsOptional()
  metadata?: any;

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsString()
  assignment_id?: string;

  @IsOptional()
  @IsString()
  quiz_id?: string;

  @IsOptional()
  @IsString()
  course_id?: string;

  @IsOptional()
  @IsString()
  series_id?: string;
}
