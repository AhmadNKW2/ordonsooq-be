import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Attribute } from './entities/attribute.entity';
import { AttributeValue } from './entities/attribute-value.entity';
import { Category } from '../categories/entities/category.entity';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';
import { ReorderAttributesDto } from './dto/reorder-attributes.dto';
import { ReorderAttributeValuesDto } from './dto/reorder-attribute-values.dto';
import { UpdateAttributeValueDto } from './dto/update-attribute-value.dto';

@Injectable()
export class AttributesService {
  constructor(
    @InjectRepository(Attribute)
    private attributeRepository: Repository<Attribute>,
    @InjectRepository(AttributeValue)
    private attributeValueRepository: Repository<AttributeValue>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
  ) {}

  private normalizeCategoryIds(categoryIds?: number[]): number[] {
    return [
      ...new Set(
        (categoryIds ?? [])
          .map((categoryId) => Number(categoryId))
          .filter((categoryId) => Number.isInteger(categoryId) && categoryId > 0),
      ),
    ];
  }

  private async syncCategoriesForAttribute(
    attributeId: number,
    categoryIds: number[],
  ): Promise<void> {
    const normalizedCategoryIds = this.normalizeCategoryIds(categoryIds);

    if (normalizedCategoryIds.length > 0) {
      const categories = await this.categoryRepository.find({
        where: { id: In(normalizedCategoryIds) },
        select: ['id'],
      });

      if (categories.length !== normalizedCategoryIds.length) {
        throw new NotFoundException('One or more categories not found');
      }
    }

    const relation = this.attributeRepository
      .createQueryBuilder()
      .relation(Attribute, 'categories')
      .of(attributeId);

    const currentCategories = (await relation.loadMany()) as Category[];
    await relation.addAndRemove(
      normalizedCategoryIds,
      currentCategories.map((category) => category.id),
    );
  }

  private async attachCategoriesToAttributes(
    attributes: Attribute[],
  ): Promise<void> {
    if (attributes.length === 0) {
      return;
    }

    const categoryRelations = await this.attributeRepository.find({
      where: { id: In(attributes.map((attribute) => attribute.id)) },
      relations: ['categories'],
    });

    const categoriesByAttributeId = new Map(
      categoryRelations.map((attribute) => [
        attribute.id,
        [...(attribute.categories ?? [])].sort(
          (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
        ),
      ]),
    );

    attributes.forEach((attribute) => {
      attribute.categories = categoriesByAttributeId.get(attribute.id) ?? [];
    });
  }

  async create(createAttributeDto: CreateAttributeDto): Promise<Attribute> {
    const existing = await this.attributeRepository.findOne({
      where: { name_en: createAttributeDto.name_en },
    });

    if (existing) {
      throw new ConflictException('Attribute with this name already exists');
    }

    // Get the max sort_order and assign the next one
    const maxSortOrder = await this.attributeRepository
      .createQueryBuilder('attribute')
      .select('MAX(attribute.sort_order)', 'max')
      .getRawOne();
    const nextSortOrder = (maxSortOrder?.max ?? -1) + 1;

    // Assign sort_order to values if they exist
    // Destructure values to handle them separately to avoid "Cyclic dependency" error in TypeORM save
    const {
      values: valuesDto,
      category_ids,
      ...attributeData
    } = createAttributeDto;

    const attribute = this.attributeRepository.create({
      ...attributeData,
      sort_order: nextSortOrder,
    });

    const savedAttribute = await this.attributeRepository.save(attribute);

    if (valuesDto && valuesDto.length > 0) {
      const values = valuesDto.map((value, index) =>
        this.attributeValueRepository.create({
          ...value,
          attribute: savedAttribute, // Linking explicitly
          sort_order: index,
        }),
      );
      await this.attributeValueRepository.save(values);
    }

    if (category_ids !== undefined) {
      await this.syncCategoriesForAttribute(savedAttribute.id, category_ids);
    }

    return this.findOne(savedAttribute.id);
  }

  async findAll(categoryIds?: number[]): Promise<Attribute[]> {
    const query = this.attributeRepository
      .createQueryBuilder('attribute')
      .leftJoinAndSelect('attribute.values', 'values')
      .leftJoin('attribute.categories', 'categories');

    if (categoryIds && categoryIds.length > 0) {
      query.where('categories.id IN (:...categoryIds)', { categoryIds });
    }

    const attributes = await query
      .orderBy('attribute.sort_order', 'ASC')
      .addOrderBy('attribute.created_at', 'DESC')
      .addOrderBy('values.sort_order', 'ASC')
      .getMany();

    // Calculate levels in memory
    const attributeMap = new Map<number, Attribute>();
    attributes.forEach((attr) => attributeMap.set(attr.id, attr));

    attributes.forEach((attr) => {
      let level = 0;
      let parentId = attr.parent_id;
      let depth = 0;
      const MAX_DEPTH = 20; // Prevent infinite loops

      while (parentId && attributeMap.has(parentId) && depth < MAX_DEPTH) {
        level++;
        parentId = attributeMap.get(parentId)!.parent_id;
        depth++;
      }

      attr.level = level;
      if (attr.values) {
        attr.values.forEach((val) => (val.level = level));
      }
    });

    await this.attachCategoriesToAttributes(attributes);

    return attributes;
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

    // Calculate level by traversing up
    let level = 0;
    let currentId: number | null = attribute.parent_id;
    const MAX_DEPTH = 20;
    let depth = 0;

    while (currentId && depth < MAX_DEPTH) {
      level++;
      // Lightweight fetch to check parent
      const parent = await this.attributeRepository.findOne({
        where: { id: currentId },
        select: ['id', 'parent_id'],
      });
      currentId = parent ? parent.parent_id : null;
      depth++;
    }

    attribute.level = level;
    if (attribute.values) {
      attribute.values.forEach((val) => (val.level = level));
    }

    await this.attachCategoriesToAttributes([attribute]);

    return attribute;
  }

  async update(
    id: number,
    updateAttributeDto: UpdateAttributeDto,
  ): Promise<Attribute> {
    // Determine if we need to check unrelated fields or just updating scalar values.
    // To avoid "Cyclic dependency: AttributeValue", we do NOT load the relations here.
    const attribute = await this.attributeRepository.findOne({ where: { id } });

    if (!attribute) {
      throw new NotFoundException(`Attribute with ID ${id} not found`);
    }

    if (
      updateAttributeDto.name_en &&
      updateAttributeDto.name_en !== attribute.name_en
    ) {
      const existing = await this.attributeRepository.findOne({
        where: { name_en: updateAttributeDto.name_en },
      });
      if (existing) {
        throw new ConflictException('Attribute with this name already exists');
      }
    }

    const { category_ids, values, ...attributeData } = updateAttributeDto;

    Object.assign(attribute, attributeData);
    await this.attributeRepository.save(attribute);

    if (category_ids !== undefined) {
      await this.syncCategoriesForAttribute(id, category_ids);
    }

    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const attribute = await this.findOne(id);
    await this.attributeRepository.remove(attribute);
  }

  async addValue(
    attributeId: number,
    valueEn: string,
    valueAr: string,
    parentValueId?: number,
  ): Promise<AttributeValue> {
    // Check if attribute exists
    const attribute = await this.attributeRepository.findOne({
      where: { id: attributeId },
    });

    if (!attribute) {
      throw new NotFoundException(`Attribute with ID ${attributeId} not found`);
    }

    // Get the max sort_order for this attribute's values
    const maxSortOrder = await this.attributeValueRepository
      .createQueryBuilder('value')
      .select('MAX(value.sort_order)', 'max')
      .where('value.attribute_id = :attributeId', { attributeId })
      .getRawOne();
    const nextSortOrder = (maxSortOrder?.max ?? -1) + 1;

    const attributeValue = this.attributeValueRepository.create({
      attribute_id: attributeId,
      value_en: valueEn,
      value_ar: valueAr,
      parent_value_id: parentValueId,
      sort_order: nextSortOrder,
    });

    return await this.attributeValueRepository.save(attributeValue);
  }

  async removeValue(valueId: number): Promise<void> {
    const value = await this.attributeValueRepository.findOne({
      where: { id: valueId },
    });

    if (!value) {
      throw new NotFoundException(
        `Attribute value with ID ${valueId} not found`,
      );
    }

    await this.attributeValueRepository.remove(value);
  }

  async updateValue(
    valueId: number,
    updateDto: UpdateAttributeValueDto,
  ): Promise<AttributeValue> {
    const value = await this.attributeValueRepository.findOne({
      where: { id: valueId },
    });

    if (!value) {
      throw new NotFoundException(
        `Attribute value with ID ${valueId} not found`,
      );
    }

    Object.assign(value, updateDto);
    return await this.attributeValueRepository.save(value);
  }

  async reorderAttributes(
    reorderDto: ReorderAttributesDto,
  ): Promise<Attribute[]> {
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
      this.attributeValueRepository.update(val.id, {
        sort_order: val.sort_order,
      }),
    );

    await Promise.all(updatePromises);

    return this.findOne(attributeId);
  }
}
