import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Attribute } from './entities/attribute.entity';
import { AttributeValue } from './entities/attribute-value.entity';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';
import { ReorderAttributesDto } from './dto/reorder-attributes.dto';
import { ReorderAttributeValuesDto } from './dto/reorder-attribute-values.dto';

@Injectable()
export class AttributesService {
  constructor(
    @InjectRepository(Attribute)
    private attributeRepository: Repository<Attribute>,
    @InjectRepository(AttributeValue)
    private attributeValueRepository: Repository<AttributeValue>,
  ) {}

  async create(createAttributeDto: CreateAttributeDto): Promise<Attribute> {
    const existing = await this.attributeRepository.findOne({
      where: { name_en: createAttributeDto.name_en },
    });

    if (existing) {
      throw new ConflictException('Attribute with this name already exists');
    }

    const attribute = this.attributeRepository.create(createAttributeDto);
    return await this.attributeRepository.save(attribute);
  }

  async findAll(): Promise<Attribute[]> {
    return await this.attributeRepository
      .createQueryBuilder('attribute')
      .leftJoinAndSelect('attribute.values', 'values')
      .orderBy('attribute.sort_order', 'ASC')
      .addOrderBy('attribute.created_at', 'DESC')
      .addOrderBy('values.sort_order', 'ASC')
      .getMany();
  }

  async findOne(id: number): Promise<Attribute> {
    const attribute = await this.attributeRepository
      .createQueryBuilder('attribute')
      .leftJoinAndSelect('attribute.values', 'values')
      .where('attribute.id = :id', { id })
      .orderBy('values.sort_order', 'ASC')
      .getOne();

    if (!attribute) {
      throw new NotFoundException(`Attribute with ID ${id} not found`);
    }

    return attribute;
  }

  async update(
    id: number,
    updateAttributeDto: UpdateAttributeDto,
  ): Promise<Attribute> {
    const attribute = await this.findOne(id);

    if (updateAttributeDto.name_en && updateAttributeDto.name_en !== attribute.name_en) {
      const existing = await this.attributeRepository.findOne({
        where: { name_en: updateAttributeDto.name_en },
      });
      if (existing) {
        throw new ConflictException('Attribute with this name already exists');
      }
    }

    Object.assign(attribute, updateAttributeDto);
    return await this.attributeRepository.save(attribute);
  }

  async remove(id: number): Promise<void> {
    const attribute = await this.findOne(id);
    await this.attributeRepository.remove(attribute);
  }

  async addValue(attributeId: number, valueEn: string, valueAr: string): Promise<AttributeValue> {
    const attribute = await this.findOne(attributeId);

    const attributeValue = this.attributeValueRepository.create({
      attribute_id: attributeId,
      value_en: valueEn,
      value_ar: valueAr,
    });

    return await this.attributeValueRepository.save(attributeValue);
  }

  async removeValue(valueId: number): Promise<void> {
    const value = await this.attributeValueRepository.findOne({
      where: { id: valueId },
    });

    if (!value) {
      throw new NotFoundException(`Attribute value with ID ${valueId} not found`);
    }

    await this.attributeValueRepository.remove(value);
  }

  async reorderAttributes(reorderDto: ReorderAttributesDto): Promise<Attribute[]> {
    const attributeIds = reorderDto.attributes.map((attr) => attr.id);
    const attributes = await this.attributeRepository.find({
      where: { id: In(attributeIds) },
    });

    if (attributes.length !== attributeIds.length) {
      throw new NotFoundException('One or more attributes not found');
    }

    const updatePromises = reorderDto.attributes.map((attr) =>
      this.attributeRepository.update(attr.id, { sort_order: attr.sort_order }),
    );

    await Promise.all(updatePromises);

    return this.findAll();
  }

  async reorderAttributeValues(
    attributeId: number,
    reorderDto: ReorderAttributeValuesDto,
  ): Promise<Attribute> {
    const attribute = await this.findOne(attributeId);

    const valueIds = reorderDto.values.map((val) => val.id);
    const values = await this.attributeValueRepository.find({
      where: { id: In(valueIds), attribute_id: attributeId },
    });

    if (values.length !== valueIds.length) {
      throw new NotFoundException(
        'One or more attribute values not found or do not belong to this attribute',
      );
    }

    const updatePromises = reorderDto.values.map((val) =>
      this.attributeValueRepository.update(val.id, { sort_order: val.sort_order }),
    );

    await Promise.all(updatePromises);

    return this.findOne(attributeId);
  }
}
