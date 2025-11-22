import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attribute } from './entities/attribute.entity';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';

@Injectable()
export class AttributesService {
  constructor(
    @InjectRepository(Attribute)
    private attributesRepository: Repository<Attribute>,
  ) {}

  async create(createAttributeDto: CreateAttributeDto): Promise<Attribute> {
    const attribute = this.attributesRepository.create(createAttributeDto);
    return await this.attributesRepository.save(attribute);
  }

  async findAll(): Promise<Attribute[]> {
    return await this.attributesRepository.find({
      order: { name_en: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Attribute> {
    const attribute = await this.attributesRepository.findOne({
      where: { id },
    });

    if (!attribute) {
      throw new NotFoundException(`Attribute with ID ${id} not found`);
    }

    return attribute;
  }

  async update(id: number, updateAttributeDto: UpdateAttributeDto): Promise<Attribute> {
    const attribute = await this.findOne(id);
    Object.assign(attribute, updateAttributeDto);
    return await this.attributesRepository.save(attribute);
  }

  async remove(id: number): Promise<void> {
    const attribute = await this.findOne(id);
    await this.attributesRepository.remove(attribute);
  }
}
