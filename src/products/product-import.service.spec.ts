import { Brand } from '../brands/entities/brand.entity';
import { ProductImportService } from './product-import.service';

describe('ProductImportService', () => {
  let service: ProductImportService;
  let specificationsService: { addValue: jest.Mock };
  let attributesService: { addValue: jest.Mock };
  let brandsService: { create: jest.Mock };

  beforeEach(() => {
    specificationsService = {
      addValue: jest.fn(),
    };
    attributesService = {
      addValue: jest.fn(),
    };
    brandsService = {
      create: jest.fn(),
    };

    service = new ProductImportService(
      { find: jest.fn() } as never,
      { create: jest.fn() } as never,
      specificationsService as never,
      attributesService as never,
      { uploadAndCreate: jest.fn() } as never,
      brandsService as never,
    );
  });

  it('prefers a corroborated payload brand over a conflicting AI brand', async () => {
    const brands = [
      { id: 1, name_en: 'Asus', name_ar: 'أسوس' },
      { id: 2, name_en: 'GIGABYTE', name_ar: 'جيجابايت' },
    ] as Brand[];

    const result = await (
      service as ProductImportService & {
        resolveOrCreateBrand: (
          brands: Brand[],
          payload: Record<string, unknown>,
          aiBrandName: unknown,
        ) => Promise<{
          brandId: number | null;
          brandName: string | null;
          brandCreated: boolean;
        }>;
      }
    ).resolveOrCreateBrand(
      brands,
      {
        title:
          'GIGABYTE G25F2A 24.5-inch FHD SuperSpeed IPS 1ms 240Hz Gaming Monitor',
        description:
          'GIGABYTE G25F2A monitor. for more Asus Rog & Asus Tuf & Asus Vivobook Laptops',
        new_price: '139.00',
        brand: 'GIGABYTE',
        image: null,
        images: [],
        media: [],
        specification: [{ key: 'BRAND', value: ['GIGABYTE'] }],
        attributes: [],
        reference_link:
          'https://mcc-jo.com/product/gigabyte-g25f2a-245-inch-fhd-superspeed-ips-1ms-240hz-gaming-monitor',
        raw_data: {},
      },
      'Asus',
    );

    expect(result).toEqual({
      brandId: 2,
      brandName: 'GIGABYTE',
      brandCreated: false,
    });
    expect(brandsService.create).not.toHaveBeenCalled();
  });

  it('reuses existing unit-based specification values before creating duplicates', async () => {
    const result = await (
      service as ProductImportService & {
        resolveSpecifications: (
          aiSpecifications: Array<{
            specification_id: number;
            values: Array<{
              original_value: { name_en: string; name_ar: string };
              matched_value_id: string;
            }>;
          }>,
          availableSpecifications: Array<Record<string, unknown>>,
        ) => Promise<
          Array<{
            specification_id: number;
            specification_value_ids: number[];
          }>
        >;
      }
    ).resolveSpecifications(
      [
        {
          specification_id: 9,
          values: [
            {
              original_value: { name_en: '25-inch', name_ar: '25-inch' },
              matched_value_id: 'not_exist',
            },
            {
              original_value: { name_en: '24.5-inch', name_ar: '24.5-inch' },
              matched_value_id: 'not_exist',
            },
          ],
        },
      ],
      [
        {
          id: 9,
          name_en: 'Screen Size',
          unit_en: 'inch',
          unit_ar: 'انش',
          values: [
            { id: 270, value_en: '25', value_ar: '25' },
            { id: 276, value_en: '24.5', value_ar: '24.5' },
          ],
        },
      ],
    );

    expect(result).toEqual([
      {
        specification_id: 9,
        specification_value_ids: [270, 276],
      },
    ]);
    expect(specificationsService.addValue).not.toHaveBeenCalled();
  });

  it('creates new unit-based specification values without persisting the unit text', async () => {
    specificationsService.addValue.mockResolvedValue({ id: 901 });

    const result = await (
      service as ProductImportService & {
        resolveSpecifications: (
          aiSpecifications: Array<{
            specification_id: number;
            values: Array<{
              original_value: { name_en: string; name_ar: string };
              matched_value_id: string;
            }>;
          }>,
          availableSpecifications: Array<Record<string, unknown>>,
        ) => Promise<
          Array<{
            specification_id: number;
            specification_value_ids: number[];
          }>
        >;
      }
    ).resolveSpecifications(
      [
        {
          specification_id: 9,
          values: [
            {
              original_value: { name_en: '9-inch', name_ar: '9-inch' },
              matched_value_id: 'not_exist',
            },
          ],
        },
      ],
      [
        {
          id: 9,
          name_en: 'Screen Size',
          unit_en: 'inch',
          unit_ar: 'انش',
          values: [],
        },
      ],
    );

    expect(result).toEqual([
      {
        specification_id: 9,
        specification_value_ids: [901],
      },
    ]);
    expect(specificationsService.addValue).toHaveBeenCalledWith(
      9,
      '9',
      '9',
      undefined,
    );
  });

  it('creates child specification values with the configured parent_value_id', async () => {
    specificationsService.addValue.mockResolvedValue({ id: 990 });

    const result = await (
      service as ProductImportService & {
        resolveSpecifications: (
          aiSpecifications: Array<{
            specification_id: number;
            values: Array<{
              original_value: { name_en: string; name_ar: string };
              matched_value_id: string;
            }>;
          }>,
          availableSpecifications: Array<Record<string, unknown>>,
        ) => Promise<
          Array<{
            specification_id: number;
            specification_value_ids: number[];
          }>
        >;
      }
    ).resolveSpecifications(
      [
        {
          specification_id: 19,
          values: [
            {
              original_value: { name_en: 'Nano SIM', name_ar: 'Nano SIM' },
              matched_value_id: 'not_exist',
            },
          ],
        },
      ],
      [
        {
          id: 19,
          name_en: 'SIM Type',
          parent_id: 11,
          parent_value_id: 330,
          values: [],
        },
      ],
    );

    expect(result).toEqual([
      {
        specification_id: 19,
        specification_value_ids: [990],
      },
    ]);
    expect(specificationsService.addValue).toHaveBeenCalledWith(
      19,
      'Nano SIM',
      'Nano SIM',
      330,
    );
  });

  it('creates child attribute values using the resolved parent value when parent_value_id is not fixed', async () => {
    attributesService.addValue.mockResolvedValue({ id: 880 });

    const result = await (
      service as ProductImportService & {
        resolveAttributes: (
          aiAttributes: Array<{
            attribute: { attribute_id: number; original_value: string };
            values: Array<{
              original_value: string;
              matched_value_id: number | string;
            }>;
          }>,
          availableAttributes: Array<Record<string, unknown>>,
        ) => Promise<
          Array<{
            attribute_id: number;
            attribute_value_ids: number[];
          }>
        >;
      }
    ).resolveAttributes(
      [
        {
          attribute: {
            attribute_id: 22,
            original_value: 'Storage Option',
          },
          values: [
            {
              original_value: '256',
              matched_value_id: 'not_exist',
            },
          ],
        },
        {
          attribute: {
            attribute_id: 11,
            original_value: 'Storage Type',
          },
          values: [
            {
              original_value: 'SSD',
              matched_value_id: 77,
            },
          ],
        },
      ],
      [
        {
          id: 22,
          name_en: 'Storage Option',
          parent_id: 11,
          level: 1,
          values: [],
        },
        {
          id: 11,
          name_en: 'Storage Type',
          level: 0,
          values: [
            {
              id: 77,
              value_en: 'SSD',
              value_ar: 'SSD',
            },
          ],
        },
      ],
    );

    expect(result).toEqual([
      {
        attribute_id: 11,
        attribute_value_ids: [77],
      },
      {
        attribute_id: 22,
        attribute_value_ids: [880],
      },
    ]);
    expect(attributesService.addValue).toHaveBeenCalledWith(
      22,
      '256',
      '256',
      77,
    );
  });
});