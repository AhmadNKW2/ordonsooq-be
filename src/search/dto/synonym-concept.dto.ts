import {
  IsString,
  IsArray,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { SynonymConceptStatus } from '../entities/search-synonym-concept.entity';

const normalizeTerms = (terms: string[]): string[] => {
  return [
    ...new Set(
      terms
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && !/^\d+$/.test(t)),
    ),
  ];
};

export class UpdateSynonymConceptDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Transform(({ value }: { value: string }) =>
    value?.trim().toLowerCase().replace(/\s+/g, '_'),
  )
  concept_key?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  @Transform(({ value }: { value: string[] }) => normalizeTerms(value))
  terms_en?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  @Transform(({ value }: { value: string[] }) => normalizeTerms(value))
  terms_ar?: string[];
}

export class CreateManualSynonymConceptDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Transform(({ value }: { value: string }) =>
    value?.trim().toLowerCase().replace(/\s+/g, '_'),
  )
  concept_key: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  @Transform(({ value }: { value: string[] }) => normalizeTerms(value))
  terms_en: string[];

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  @Transform(({ value }: { value: string[] }) => normalizeTerms(value))
  terms_ar: string[];
}

export class ListSynonymConceptsQueryDto {
  @IsOptional()
  @IsEnum(SynonymConceptStatus)
  status?: SynonymConceptStatus;

  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  per_page?: number = 20;
}
