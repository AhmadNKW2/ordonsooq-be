import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Specification } from './entities/specification.entity';
import { SpecificationValue } from './entities/specification-value.entity';
import { CreateSpecificationDto } from './dto/create-specification.dto';
import { UpdateSpecificationDto } from './dto/update-specification.dto';
import { ReorderSpecificationsDto } from './dto/reorder-specifications.dto';
import { ReorderSpecificationValuesDto } from './dto/reorder-specification-values.dto';
import { UpdateSpecificationValueDto } from './dto/update-specification-value.dto';

@Injectable()
export class SpecificationsService {
  constructor(
    @InjectRepository(Specification)
    private specificationRepository: Repository<Specification>,
    @InjectRepository(SpecificationValue)
    private specificationValueRepository: Repository<SpecificationValue>,
  ) {}

  async create(createSpecificationDto: CreateSpecificationDto): Promise<Specification> {
    const existing = await this.specificationRepository.findOne({
      where: { name_en: createSpecificationDto.name_en },
    });

    if (existing) {
      throw new ConflictException('Specification with this name already exists');
    }

    const maxSortOrder = await this.specificationRepository
      .createQueryBuilder('specification')
      .select('MAX(specification.sort_order)', 'max')
      .getRawOne();
    const nextSortOrder = (maxSortOrder?.max ?? -1) + 1;

    const { values: valuesDto, ...specificationData } = createSpecificationDto;

    const specification = this.specificationRepository.create({
      ...specificationData,
      sort_order: nextSortOrder,
    });

    const savedSpecification = await this.specificationRepository.save(specification);

    if (valuesDto && valuesDto.length > 0) {
      const values = valuesDto.map((value, index) =>
        this.specificationValueRepository.create({
          ...value,
          specification: savedSpecification,
          sort_order: index,
        }),
      );
      await this.specificationValueRepository.save(values);
    }

    return this.findOne(savedSpecification.id);
  }

  async findAll(): Promise<Specification[]> {
    const specifications = await this.specificationRepository
      .createQueryBuilder('specification')
      .leftJoinAndSelect('specification.values', 'values')
      .orderBy('specification.sort_order', 'ASC')
      .addOrderBy('specification.created_at', 'DESC')
      .addOrderBy('values.sort_order', 'ASC')
      .getMany();

    const specificationMap = new Map<number, Specification>();
    specifications.forEach((spec) => specificationMap.set(spec.id, spec));

    specifications.forEach((spec) => {
      let level = 0;
      let parentId = spec.parent_id;
      let depth = 0;
      const MAX_DEPTH = 20;

      while (parentId && specificationMap.has(parentId) && depth < MAX_DEPTH) {
        level++;
        parentId = specificationMap.get(parentId)!.parent_id;
        depth++;
      }

      spec.level = level;
      if (spec.values) {
        spec.values.forEach((val) => (val.level = level));
      }
    });

    return specifications;
  }

  async findOne(id: number): Promise<Specification> {
    const specification = await this.specificationRepository
      .createQueryBuilder('specification')
      .leftJoinAndSelect('specification.values', 'values')
      .where('specification.id = :id', { id })
      .orderBy('values.sort_order', 'ASC')
      .getOne();

    if (!specification) {
      throw new NotFoundException(`Specification with ID ${id} not found`);
    }

    let level = 0;
    let currentId: number | null = specification.parent_id;
    const MAX_DEPTH = 20;
    let depth = 0;

    while (currentId && depth < MAX_DEPTH) {
      level++;
      const parent = await this.specificationRepository.findOne({
        where: { id: currentId },
        select: ['id', 'parent_id'],
      });
      currentId = parent ? parent.parent_id : null;
      depth++;
    }

    specification.level = level;
    if (specification.values) {
      specification.values.forEach((val) => (val.level = level));
    }

    return specification;
  }

  async update(
    id: number,
    updateSpecificationDto: UpdateSpecificationDto,
  ): Promise<Specification> {
    const specification = await this.specificationRepository.findOne({ where: { id } });

    if (!specification) {
      throw new NotFoundException(`Specification with ID ${id} not found`);
    }

    if (
      updateSpecificationDto.name_en &&
      updateSpecificationDto.name_en !== specification.name_en
    ) {
      const existing = await this.specificationRepository.findOne({
        where: { name_en: updateSpecificationDto.name_en },
      });
      if (existing) {
        throw new ConflictException('Specification with this name already exists');
      }
    }

    Object.assign(specification, updateSpecificationDto);
    return await this.specificationRepository.save(specification);
  }

  async remove(id: number): Promise<void> {
    const specification = await this.findOne(id);
    await this.specificationRepository.remove(specification);
  }

  async addValue(
    specificationId: number,
    valueEn: string,
    valueAr: string,
    parentValueId?: number,
  ): Promise<SpecificationValue> {
    const specification = await this.specificationRepository.findOne({
      where: { id: specificationId },
    });

    if (!specification) {
      throw new NotFoundException(`Specification with ID ${specificationId} not found`);
    }

    const maxSortOrder = await this.specificationValueRepository
      .createQueryBuilder('value')
      .select('MAX(value.sort_order)', 'max')
      .where('value.specification_id = :specificationId', { specificationId })
      .getRawOne();
    const nextSortOrder = (maxSortOrder?.max ?? -1) + 1;

    const specificationValue = this.specificationValueRepository.create({
      specification_id: specificationId,
      value_en: valueEn,
      value_ar: valueAr,
      parent_value_id: parentValueId,
      sort_order: nextSortOrder,
    });

    return await this.specificationValueRepository.save(specificationValue);
  }

  async removeValue(valueId: number): Promise<void> {
    const value = await this.specificationValueRepository.findOne({
      where: { id: valueId },
    });

    if (!value) {
      throw new NotFoundException(
        `Specification value with ID ${valueId} not found`,
      );
    }

    await this.specificationValueRepository.remove(value);
  }

  async updateValue(
    valueId: number,
    updateDto: UpdateSpecificationValueDto,
  ): Promise<SpecificationValue> {
    const value = await this.specificationValueRepository.findOne({
      where: { id: valueId },
    });

    if (!value) {
      throw new NotFoundException(
        `Specification value with ID ${valueId} not found`,
      );
    }

    Object.assign(value, updateDto);
    return await this.specificationValueRepository.save(value);
  }

  async reorderSpecifications(
    reorderDto: ReorderSpecificationsDto,
  ): Promise<Specification[]> {
    const specificationIds = reorderDto.specifications.map((spec) => spec.id);
    const specifications = await this.specificationRepository.find({
      where: { id: In(specificationIds) },
    });

    if (specifications.length !== specificationIds.length) {
      throw new NotFoundException('One or more specifications not found');
    }

    const updatePromises = reorderDto.specifications.map((spec) =>
      this.specificationRepository.update(spec.id, { sort_order: spec.sort_order }),
    );

    await Promise.all(updatePromises);

    return this.findAll();
  }

  async reorderSpecificationValues(
    specificationId: number,
    reorderDto: ReorderSpecificationValuesDto,
  ): Promise<Specification> {
    const specification = await this.findOne(specificationId);

    const valueIds = reorderDto.values.map((val) => val.id);
    const values = await this.specificationValueRepository.find({
      where: { id: In(valueIds), specification_id: specificationId },
    });

    if (values.length !== valueIds.length) {
      throw new NotFoundException(
        'One or more specification values not found or do not belong to this specification',
      );
    }

    const updatePromises = reorderDto.values.map((val) =>
      this.specificationValueRepository.update(val.id, {
        sort_order: val.sort_order,
      }),
    );

    await Promise.all(updatePromises);

    return this.findOne(specificationId);
  }
}
