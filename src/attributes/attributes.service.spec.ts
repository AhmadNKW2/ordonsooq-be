import { BadRequestException } from '@nestjs/common';
import { AttributesService } from './attributes.service';

describe('AttributesService child parent enforcement', () => {
  let service: AttributesService;
  let attributeRepository: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let attributeValueRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let categoryRepository: { find: jest.Mock };

  beforeEach(() => {
    attributeRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    attributeValueRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    categoryRepository = {
      find: jest.fn(),
    };

    service = new AttributesService(
      attributeRepository as never,
      attributeValueRepository as never,
      categoryRepository as never,
    );
  });

  it('rejects creating a child attribute when an initial value has no parent_value_id', async () => {
    attributeRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 91 });

    await expect(
      service.create({
        name_en: 'Storage',
        name_ar: 'السعة',
        parent_id: 91,
        values: [
          {
            value_en: '256 GB',
            value_ar: '256 جيجابايت',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(attributeRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('rejects linking an existing attribute to a parent while some values have no parent_value_id', async () => {
    attributeRepository.findOne
      .mockResolvedValueOnce({
        id: 10,
        name_en: 'Storage',
        name_ar: 'السعة',
        parent_id: null,
        parent_value_id: null,
      })
      .mockResolvedValueOnce({ id: 91 });
    attributeValueRepository.find.mockResolvedValue([
      { id: 501, parent_value_id: null },
    ]);

    await expect(
      service.update(10, {
        parent_id: 91,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(attributeRepository.save).not.toHaveBeenCalled();
  });

  it('requires child attribute values to reference a parent attribute value', async () => {
    attributeRepository.findOne.mockResolvedValue({ id: 10, parent_id: 91 });

    await expect(
      service.addValue(10, '256 GB', '256 جيجابايت'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(attributeValueRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
});