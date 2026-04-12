import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportProductPayloadDto {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Raw source payload. If omitted, the endpoint treats the whole request body as the source payload.',
    example: {
      category_id: 35,
      vendor_id: 2,
      reference_link: 'https://example.com/products/sample-monitor',
      data: {
        title: '27 Inch Gaming Monitor 180Hz IPS',
        description:
          'Fast IPS panel with 180Hz refresh rate, 1ms response time, and Adaptive Sync support.',
        brand: 'ASUS',
        new_price: '199.99',
        old_price: '249.99',
        image: 'https://example.com/images/monitor-front.jpg',
        images: [
          'https://example.com/images/monitor-front.jpg',
          'https://example.com/images/monitor-side.jpg',
        ],
        specification: [
          {
            name: 'Panel Type',
            value: 'IPS',
          },
          {
            name: 'Refresh Rate',
            value: '180Hz',
          },
        ],
        attributes: [
          {
            name: 'Color',
            value: 'Black',
          },
        ],
      },
    },
  })
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: 35,
    description:
      'Category override. If omitted, the endpoint will try payload.category_id or payload.category_ids[0].',
  })
  category_id?: number;

  @ApiPropertyOptional({
    example: 2,
    description:
      'Vendor override. If omitted, the endpoint will try payload.vendor_id.',
  })
  vendor_id?: number;

  @ApiPropertyOptional({
    example: 'gpt-5.4',
    description:
      'Optional OpenAI model override. Falls back to PRODUCT_IMPORT_OPENAI_MODEL or gpt-5.4.',
  })
  model?: string;
}