import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsInt, IsOptional } from 'class-validator';

function dedupePositiveIntegers(values: unknown[]): number[] {
  return [
    ...new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ];
}

function normalizeProductIdList(value: unknown): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === '' || value === null) {
    return [];
  }

  if (typeof value === 'string') {
    try {
      return normalizeProductIdList(JSON.parse(value));
    } catch {
      return dedupePositiveIntegers(value.split(','));
    }
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return dedupePositiveIntegers(value);
}

export function parseProductChangesInput(value: unknown): unknown {
  if (value === undefined || value === '' || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

export function getNormalizedProductChanges(productChanges?: ProductChangesDto): {
  addProductIds: number[];
  removeProductIds: number[];
  conflictingProductIds: number[];
} {
  const addProductIds = productChanges?.add_product_ids ?? [];
  const removeProductIds = productChanges?.remove_product_ids ?? [];
  const removeProductIdSet = new Set(removeProductIds);
  const conflictingProductIds = [
    ...new Set(
      addProductIds.filter((productId) => removeProductIdSet.has(productId)),
    ),
  ];

  return {
    addProductIds,
    removeProductIds,
    conflictingProductIds,
  };
}

export class ProductChangesDto {
  @ApiPropertyOptional({
    type: [Number],
    example: [101, 102, 103],
    description: 'Product IDs to add or link to this resource.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeProductIdList(value))
  @IsArray()
  @IsInt({ each: true })
  add_product_ids?: number[];

  @ApiPropertyOptional({
    type: [Number],
    example: [201, 202, 203],
    description: 'Product IDs to remove or unlink from this resource.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeProductIdList(value))
  @IsArray()
  @IsInt({ each: true })
  remove_product_ids?: number[];
}