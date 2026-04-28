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
    expect(specificationsService.addValue).toHaveBeenCalledWith(9, '9', '9');
  });
});