// src/event-ingestion/dto/ingest-event.dto.ts
import { IsString, IsOptional, IsDateString, IsNumber } from 'class-validator';

export class IngestEventDto {
  @IsString()
  title: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  categoryId: number;
}
