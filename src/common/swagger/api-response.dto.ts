import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

export class ApiPaginationMetaDto {
  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

export class ApiErrorDetailDto {
  @ApiProperty({ example: 'email' })
  field: string;

  @ApiProperty({ example: 'email must be an email' })
  message: string;
}

export class ApiErrorBodyDto {
  @ApiProperty({ example: 400 })
  code: number;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiPropertyOptional({ type: [ApiErrorDetailDto] })
  details?: ApiErrorDetailDto[];
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty({ type: ApiErrorBodyDto })
  error: ApiErrorBodyDto;

  @ApiProperty({
    example: '2026-03-31T12:00:00.000Z',
    format: 'date-time',
  })
  time: string;
}

type WrappedResponseOptions = {
  status: number;
  description: string;
  model?: Type<unknown>;
  isArray?: boolean;
  paginated?: boolean;
  messageExample?: string;
};

function buildWrappedSuccessSchema({
  model,
  isArray = false,
  paginated = false,
  messageExample = 'Success',
}: Omit<WrappedResponseOptions, 'status' | 'description'>): Record<string, any> {
  const properties: Record<string, any> = {
    success: {
      type: 'boolean',
      example: true,
    },
    message: {
      type: 'string',
      example: messageExample,
    },
    time: {
      type: 'string',
      format: 'date-time',
      example: '2026-03-31T12:00:00.000+03:00',
    },
  };
  const required = ['success', 'message', 'time'];

  if (model) {
    properties.data = isArray
      ? {
          type: 'array',
          items: {
            $ref: getSchemaPath(model),
          },
        }
      : {
          $ref: getSchemaPath(model),
        };
    required.push('data');
  }

  if (paginated) {
    properties.meta = {
      $ref: getSchemaPath(ApiPaginationMetaDto),
    };
    required.push('meta');
  }

  return {
    type: 'object',
    required,
    properties,
  };
}

export function ApiWrappedResponse({
  status,
  description,
  model,
  isArray = false,
  paginated = false,
  messageExample = 'Success',
}: WrappedResponseOptions) {
  const extraModels: Array<Type<unknown>> = [ApiPaginationMetaDto];

  if (model) {
    extraModels.push(model);
  }

  return applyDecorators(
    ApiExtraModels(...extraModels),
    ApiResponse({
      status,
      description,
      schema: buildWrappedSuccessSchema({
        model,
        isArray,
        paginated,
        messageExample,
      }) as any,
    }),
  );
}