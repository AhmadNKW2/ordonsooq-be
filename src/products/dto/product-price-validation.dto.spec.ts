import { ValidationPipe } from '@nestjs/common';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

describe('Product price payload validation', () => {
  const validationPipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  });

  const basePayload = {
    name_en: 'Wireless Headphones',
    name_ar: 'سماعات لاسلكية',
    short_description_en: 'Short description',
    short_description_ar: 'وصف قصير',
    long_description_en: 'Long description',
    long_description_ar: 'وصف طويل',
    category_ids: [1],
  };

  async function transformBody<T>(
    payload: Record<string, unknown>,
    metatype: new () => T,
  ) {
    return validationPipe.transform(payload, {
      type: 'body',
      metatype,
      data: '',
    }) as Promise<T>;
  }

  async function expectNumberValidationError<T>(
    payload: Record<string, unknown>,
    metatype: new () => T,
    field: string,
  ) {
    try {
      await transformBody(payload, metatype);
      throw new Error(`Expected ${field} validation to fail`);
    } catch (error: any) {
      expect(error.getStatus?.()).toBe(400);
      expect(error.getResponse?.()).toMatchObject({
        message: expect.arrayContaining([
          `${field} must be a number conforming to the specified constraints`,
        ]),
      });
    }
  }

  it('accepts floating-point prices on create payloads', async () => {
    const result = await transformBody(
      {
        ...basePayload,
        cost: 10.5,
        price: 19.99,
        sale_price: 15.75,
      },
      CreateProductDto,
    );

    expect(result.cost).toBe(10.5);
    expect(result.price).toBe(19.99);
    expect(result.sale_price).toBe(15.75);
  });

  it.each(['cost', 'price', 'sale_price'] as const)(
    'rejects string %s on create payloads',
    async (field) => {
      await expectNumberValidationError(
        {
          ...basePayload,
          [field]: '19.99',
        },
        CreateProductDto,
        field,
      );
    },
  );

  it('accepts floating-point prices on update payloads', async () => {
    const result = await transformBody(
      {
        ...basePayload,
        cost: 20.25,
        price: 39.95,
        sale_price: 31.5,
      },
      UpdateProductDto,
    );

    expect(result.cost).toBe(20.25);
    expect(result.price).toBe(39.95);
    expect(result.sale_price).toBe(31.5);
  });

  it.each(['cost', 'price', 'sale_price'] as const)(
    'rejects string %s on update payloads',
    async (field) => {
      await expectNumberValidationError(
        {
          ...basePayload,
          [field]: '39.95',
        },
        UpdateProductDto,
        field,
      );
    },
  );
});