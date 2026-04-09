import { ValidationPipe } from '@nestjs/common';
import { ProductNamesQueryDto } from './product-names-query.dto';

describe('ProductNamesQueryDto', () => {
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
      metatype: ProductNamesQueryDto,
      data: '',
    }) as Promise<ProductNamesQueryDto>;
  }

  it('accepts vendor_id for filtering product names', async () => {
    const result = await transformQuery({ vendor_id: '2' });

    expect(result.vendor_id).toBe(2);
  });

  it('accepts search for filtering product names by name', async () => {
    const result = await transformQuery({ search: ' monitor ' });

    expect(result.search).toBe('monitor');
  });

  it('accepts category_ids for filtering product names by categories', async () => {
    const result = await transformQuery({ category_ids: '1,2,3' });

    expect(result.category_ids).toEqual([1, 2, 3]);
  });
});