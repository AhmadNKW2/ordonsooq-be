import { BadRequestException } from '@nestjs/common';
import { SpecificationsService } from './specifications.service';

describe('SpecificationsService child parent enforcement', () => {
  let service: SpecificationsService;
  let specificationRepository: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let specificationValueRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let categoryRepository: { find: jest.Mock };

  beforeEach(() => {
    specificationRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    specificationValueRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    categoryRepository = {
      find: jest.fn(),
    };

    service = new SpecificationsService(
      specificationRepository as never,
      specificationValueRepository as never,
      categoryRepository as never,
    );
  });

  it('rejects creating a child specification when an initial value has no parent_value_id', async () => {
    specificationRepository.findOne
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

    expect(specificationRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('rejects linking an existing specification to a parent while some values have no parent_value_id', async () => {
    specificationRepository.findOne
      .mockResolvedValueOnce({
        id: 10,
        name_en: 'Storage',
        name_ar: 'السعة',
        parent_id: null,
        parent_value_id: null,
      })
      .mockResolvedValueOnce({ id: 91 });
    specificationValueRepository.find.mockResolvedValue([
      { id: 501, parent_value_id: null },
    ]);

    await expect(
      service.update(10, {
        parent_id: 91,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(specificationRepository.save).not.toHaveBeenCalled();
  });

  it('requires child specification values to reference a parent specification value', async () => {
    specificationRepository.findOne.mockResolvedValue({
      id: 10,
      parent_id: 91,
    });

    await expect(
      service.addValue(10, '256 GB', '256 جيجابايت'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(specificationValueRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
});