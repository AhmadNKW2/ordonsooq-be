import { ValidationPipe } from '@nestjs/common';
import { FilterProductDto, getSingleVendorId } from './filter-product.dto';

describe('FilterProductDto', () => {
  const validationPipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  });

  async function transformQuery(query: Record<string, unknown>) {
    return validationPipe.transform(query, {
      type: 'query',
      metatype: FilterProductDto,
      data: '',
    }) as Promise<FilterProductDto>;
  }

  it('accepts vendorId as the canonical query parameter', async () => {
    const result = await transformQuery({ vendorId: '2' });

    expect(result.vendorId).toBe(2);
  });

  it('accepts vendor_id as a backward-compatible alias', async () => {
    const result = await transformQuery({ vendor_id: '2' });

    expect(result.vendor_id).toBe(2);
    expect(getSingleVendorId(result)).toBe(2);
  });
});