import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attribute } from './entities/attribute.entity';
import { AttributeValue } from './entities/attribute-value.entity';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';

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
    return await this.attributeRepository.find({
      relations: ['values'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Attribute> {
    const attribute = await this.attributeRepository.findOne({
      where: { id },
      relations: ['values'],
    });

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
}
