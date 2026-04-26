import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { extname } from 'path';
import { Readable } from 'stream';
import { AttributesService } from '../attributes/attributes.service';
import { Attribute } from '../attributes/entities/attribute.entity';
import { MediaService } from '../media/media.service';
import { Brand, BrandStatus } from '../brands/entities/brand.entity';
import { Specification } from '../specifications/entities/specification.entity';
import { SpecificationsService } from '../specifications/specifications.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductStatus } from './entities/product.entity';
import { ProductsService } from './products.service';

const NOT_EXIST = 'not_exist';

interface ParsedImportRequest {
  payload: NormalizedImportPayload;
  categoryId: number;
  vendorId: number;
  model: string;
}

interface NormalizedImportPayload {
  title: string;
  description: string;
  new_price: unknown;
  old_price?: unknown;
  price?: unknown;
  sale_price?: unknown;
  brand?: string | null;
  image?: unknown;
  images: unknown[];
  media: unknown[];
  specification: unknown[];
  attributes: unknown[];
  reference_link?: string | null;
  quantity?: unknown;
  stock?: unknown;
  sku?: string | null;
  record?: string | null;
}

interface ImportAiSpecificationValue {
  original_value?: unknown;
  matched_value_id?: unknown;
}

interface ImportAiSpecification {
  specification_id?: unknown;
  values?: ImportAiSpecificationValue[];
}

interface ImportAiAttributeValue {
  original_value?: unknown;
  matched_value_id?: unknown;
}

interface ImportAiAttribute {
  attribute?: {
    attribute_id?: unknown;
    original_value?: unknown;
  };
  values?: ImportAiAttributeValue[];
}

interface ImportAiResult {
  brand_name?: unknown;
  title_en?: unknown;
  title_ar?: unknown;
  meta_title_en?: unknown;
  meta_title_ar?: unknown;
  short_description_en?: unknown;
  short_description_ar?: unknown;
  description_en?: unknown;
  description_ar?: unknown;
  meta_description_en?: unknown;
  meta_description_ar?: unknown;
  specifications?: ImportAiSpecification[];
  attributes?: ImportAiAttribute[];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

@Injectable()
export class ProductImportService {
  private readonly logger = new Logger(ProductImportService.name);

  constructor(
    @InjectRepository(Brand)
    private readonly brandsRepository: Repository<Brand>,
    private readonly productsService: ProductsService,
    private readonly specificationsService: SpecificationsService,
    private readonly attributesService: AttributesService,
    private readonly mediaService: MediaService,
  ) {}

  async importFromRequest(
    body: Record<string, unknown>,
    userId?: number,
  ) {
    try {
      const request = this.parseRequest(body);
      const brands = await this.brandsRepository.find({
        where: { status: BrandStatus.ACTIVE },
        order: { name_en: 'ASC' },
      });
      const specifications = (await this.specificationsService.findAll([
        request.categoryId,
      ])).filter((specification) => specification.is_active);
      const attributes = (await this.attributesService.findAll([
        request.categoryId,
      ])).filter((attribute) => attribute.is_active);
      const aiResult = await this.callOpenAi(
        request.payload,
        brands,
        specifications,
        attributes,
        request.model,
      );
      const { brandId } = this.resolveOptionalBrand(
        brands,
        request.payload,
        aiResult.brand_name,
      );
      const specificationsPayload = await this.resolveSpecifications(
        aiResult.specifications ?? [],
      );
      const attributesPayload = await this.resolveAttributes(
        aiResult.attributes ?? [],
      );
      const media = await this.buildMedia(request.payload);
      const pricing = this.resolvePricing(request.payload);
      const isOutOfStock = this.resolveOutOfStock(request.payload);
      const quantity = this.resolveQuantity(request.payload, isOutOfStock);
      const metaTitleEn = this.requireOptionalString(aiResult.meta_title_en);
      const metaTitleAr = this.requireOptionalString(aiResult.meta_title_ar);
      const metaDescriptionEn = this.requireOptionalString(
        aiResult.meta_description_en,
      );
      const metaDescriptionAr = this.requireOptionalString(
        aiResult.meta_description_ar,
      );
      const referenceLink = request.payload.reference_link ?? undefined;

      const createProductDto: CreateProductDto = {
        name_en: this.requireString(aiResult.title_en, 'AI title_en'),
        name_ar: this.requireString(aiResult.title_ar, 'AI title_ar'),
        status: ProductStatus.REVIEW,
        short_description_en: this.requireString(
          aiResult.short_description_en,
          'AI short_description_en',
        ),
        short_description_ar: this.requireString(
          aiResult.short_description_ar,
          'AI short_description_ar',
        ),
        long_description_en: this.requireString(
          aiResult.description_en,
          'AI description_en',
        ),
        long_description_ar: this.requireString(
          aiResult.description_ar,
          'AI description_ar',
        ),
        category_ids: [request.categoryId],
        vendor_id: request.vendorId,
        visible: true,
        specifications: specificationsPayload,
        attributes: attributesPayload,
        price: pricing.price,
        quantity,
        is_out_of_stock: isOutOfStock,
        media,
        linked_product_ids: [],
      };

      if (metaTitleEn) {
        createProductDto.meta_title_en = metaTitleEn;
      }

      if (metaTitleAr) {
        createProductDto.meta_title_ar = metaTitleAr;
      }

      if (metaDescriptionEn) {
        createProductDto.meta_description_en = metaDescriptionEn;
      }

      if (metaDescriptionAr) {
        createProductDto.meta_description_ar = metaDescriptionAr;
      }

      if (referenceLink) {
        createProductDto.reference_link = referenceLink;
      }

      if (pricing.salePrice !== null) {
        createProductDto.sale_price = pricing.salePrice;
      }

      const sku = this.requireOptionalString(request.payload.sku);
      if (sku) {
        createProductDto.sku = sku;
      }

      const record = this.requireOptionalString(request.payload.record);
      if (record) {
        createProductDto.record = record;
      }

      if (brandId !== null) {
        createProductDto.brand_id = brandId;
      }

      return this.productsService.create(createProductDto, userId);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(
        `Failed to import product payload: ${getErrorMessage(error)}`,
      );
      throw new BadRequestException(
        `Failed to import product payload: ${getErrorMessage(error)}`,
      );
    }
  }

  private parseRequest(body: Record<string, unknown>): ParsedImportRequest {
    const payloadCandidate = this.getObject(body.payload);
    const rawPayload = payloadCandidate ?? body;
    const payload = this.normalizePayload(rawPayload);
    const categoryId =
      this.extractPositiveInteger(body.category_id) ??
      this.extractPositiveInteger(rawPayload.category_id) ??
      this.extractFirstPositiveInteger(body.category_ids) ??
      this.extractFirstPositiveInteger(rawPayload.category_ids);
    const vendorId =
      this.extractPositiveInteger(body.vendor_id) ??
      this.extractPositiveInteger(rawPayload.vendor_id);
    const model =
      this.requireOptionalString(body.model) ??
      this.requireOptionalString(rawPayload.model) ??
      process.env.PRODUCT_IMPORT_OPENAI_MODEL?.trim() ??
      'gpt-5.4';

    if (!categoryId) {
      throw new BadRequestException(
        'category_id is required either at the top level or inside payload.',
      );
    }

    if (!vendorId) {
      throw new BadRequestException(
        'vendor_id is required either at the top level or inside payload.',
      );
    }

    return {
      payload,
      categoryId,
      vendorId,
      model,
    };
  }

  private normalizePayload(
    rawPayload: Record<string, unknown>,
  ): NormalizedImportPayload {
    const nestedData = this.getObject(rawPayload.data);
    const mergedPayload = nestedData
      ? { ...rawPayload, ...nestedData }
      : { ...rawPayload };
    const title =
      this.firstNonEmptyString([
        mergedPayload.title,
        mergedPayload.name_en,
        mergedPayload.title_en,
      ]) ?? null;
    const description =
      this.firstNonEmptyString([
        mergedPayload.description,
        mergedPayload.long_description_en,
        mergedPayload.short_description_en,
      ]) ?? null;
    const newPrice = this.firstDefinedValue([
      mergedPayload.new_price,
      mergedPayload.sale_price,
      mergedPayload.price,
    ]);
    const oldPrice = this.firstDefinedValue([
      mergedPayload.old_price,
      mergedPayload.sale_price !== undefined ? mergedPayload.price : undefined,
    ]);

    if (!title || !description || newPrice === undefined) {
      throw new BadRequestException(
        'The import payload must include title, description, and new_price (or price/sale_price equivalents).',
      );
    }

    return {
      title,
      description,
      new_price: newPrice,
      old_price: oldPrice,
      price: mergedPayload.price,
      sale_price: mergedPayload.sale_price,
      brand: this.requireOptionalString(mergedPayload.brand),
      image: mergedPayload.image,
      images: this.normalizeInputCollection(mergedPayload.images),
      media: this.normalizeInputCollection(mergedPayload.media),
      specification: this.normalizeInputCollection(
        mergedPayload.specification ?? mergedPayload.specifications,
      ),
      attributes: this.normalizeInputCollection(mergedPayload.attributes),
      reference_link:
        this.requireOptionalString(mergedPayload.reference_link) ??
        this.requireOptionalString(mergedPayload.url) ??
        this.requireOptionalString(mergedPayload.link),
      quantity: mergedPayload.quantity,
      stock: mergedPayload.stock ?? mergedPayload.in_stock,
      sku: this.requireOptionalString(mergedPayload.sku),
      record: this.requireOptionalString(mergedPayload.record),
    };
  }

  private normalizeInputCollection(value: unknown): unknown[] {
    if (value === null || value === undefined) {
      return [];
    }

    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);

      if (!entries.length) {
        return [];
      }

      return entries.map(([name, entryValue]) => ({
        name,
        value: entryValue,
      }));
    }

    return [value];
  }

  private async callOpenAi(
    payload: NormalizedImportPayload,
    brands: Brand[],
    specifications: Specification[],
    attributes: Attribute[],
    model: string,
  ): Promise<ImportAiResult> {
    const openaiKey = process.env.OPENAI_API_KEY?.trim();

    if (!openaiKey) {
      throw new BadRequestException(
        'Missing OPENAI_API_KEY environment variable.',
      );
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: this.buildSystemPrompt(brands, specifications, attributes),
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                brand: payload.brand,
                title: payload.title,
                description: payload.description,
                specification: payload.specification,
                attributes: payload.attributes,
              },
              null,
              2,
            ),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new BadRequestException(
        `OpenAI error ${response.status}: ${await response.text()}`,
      );
    }

    const body = (await response.json()) as Record<string, unknown>;
    const rawText = this.extractOpenAiText(body);
    const cleaned = this.stripCodeFences(rawText);

    try {
      return JSON.parse(cleaned) as ImportAiResult;
    } catch (error) {
      throw new BadRequestException(
        `OpenAI returned invalid JSON: ${getErrorMessage(error)}`,
      );
    }
  }

  private extractOpenAiText(body: Record<string, unknown>): string {
    const outputText = this.requireOptionalString(body.output_text);
    if (outputText) {
      return outputText;
    }

    const choices = Array.isArray(body.choices)
      ? (body.choices as Array<Record<string, unknown>>)
      : [];
    const choiceMessage = this.getObject(choices[0]?.message);
    const messageContent = this.requireOptionalString(choiceMessage?.content);
    if (messageContent) {
      return messageContent;
    }

    const output = Array.isArray(body.output)
      ? (body.output as Array<Record<string, unknown>>)
      : [];

    for (const item of output) {
      const content = Array.isArray(item.content)
        ? (item.content as Array<Record<string, unknown>>)
        : [];

      for (const contentItem of content) {
        const text =
          this.requireOptionalString(contentItem.text) ??
          this.requireOptionalString(this.getObject(contentItem.text)?.value);

        if (text) {
          return text;
        }
      }
    }

    throw new BadRequestException('OpenAI response did not include text output.');
  }

  private stripCodeFences(value: string): string {
    return value
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
  }

  private resolveOptionalBrand(
    brands: Brand[],
    payload: NormalizedImportPayload,
    aiBrandName: unknown,
  ): { brandId: number | null; brandName: string | null } {
    const sourceBrand = this.requireOptionalString(payload.brand);
    const detectedBrand = this.detectBrandNameFromText(brands, payload);
    const aiBrand = this.requireOptionalString(aiBrandName);

    for (const candidate of [sourceBrand, detectedBrand, aiBrand]) {
      if (!candidate) {
        continue;
      }

      const brandId = this.findBrandIdByName(brands, candidate);
      if (brandId !== null) {
        return {
          brandId,
          brandName: candidate,
        };
      }
    }

    return {
      brandId: null,
      brandName: null,
    };
  }

  private detectBrandNameFromText(
    brands: Brand[],
    payload: NormalizedImportPayload,
  ): string | null {
    const searchableText = [
      payload.title,
      payload.description,
      payload.reference_link,
    ]
      .filter((value): value is string => !!value)
      .join(' ');
    const normalizedText = this.normalizeLookupText(searchableText);

    if (!normalizedText) {
      return null;
    }

    const candidates = brands
      .map((brand) => brand.name_en?.trim())
      .filter((name): name is string => !!name)
      .sort((left, right) => right.length - left.length);

    for (const candidate of candidates) {
      if (normalizedText.includes(this.normalizeLookupText(candidate))) {
        return candidate;
      }
    }

    return null;
  }

  private findBrandIdByName(brands: Brand[], brandName: string): number | null {
    const normalizedBrandName = this.normalizeLookupText(brandName);

    for (const brand of brands) {
      const brandNames = [brand.name_en, brand.name_ar]
        .map((name) => this.requireOptionalString(name))
        .filter((name): name is string => !!name)
        .map((name) => this.normalizeLookupText(name));

      if (brandNames.includes(normalizedBrandName)) {
        return brand.id;
      }
    }

    return null;
  }

  private normalizeLookupText(value: string): string {
    return Array.from(value.toLowerCase())
      .filter((character) => /[\p{L}\p{N}]/u.test(character))
      .join('');
  }

  private async resolveSpecifications(
    aiSpecifications: ImportAiSpecification[],
  ): Promise<
    Array<{
      specification_id: number;
      specification_value_ids: number[];
    }>
  > {
    const specificationMap = new Map<number, Set<number>>();

    for (const specification of aiSpecifications) {
      const specificationId = this.extractPositiveInteger(
        specification.specification_id,
      );

      if (!specificationId) {
        continue;
      }

      if (!specificationMap.has(specificationId)) {
        specificationMap.set(specificationId, new Set<number>());
      }

      for (const value of specification.values ?? []) {
        let matchedValueId = this.extractPositiveInteger(value.matched_value_id);

        if (!matchedValueId && this.isNotExist(value.matched_value_id)) {
          const localizedValue = this.extractLocalizedValue(value.original_value);
          matchedValueId = (
            await this.specificationsService.addValue(
              specificationId,
              localizedValue.name_en,
              localizedValue.name_ar,
            )
          ).id;
        }

        if (matchedValueId) {
          specificationMap.get(specificationId)?.add(matchedValueId);
        }
      }
    }

    return Array.from(specificationMap.entries())
      .map(([specification_id, valueIds]) => ({
        specification_id,
        specification_value_ids: Array.from(valueIds).sort((left, right) => left - right),
      }))
      .filter((specification) => specification.specification_value_ids.length > 0);
  }

  private async resolveAttributes(
    aiAttributes: ImportAiAttribute[],
  ): Promise<
    Array<{
      attribute_id: number;
      attribute_value_ids: number[];
    }>
  > {
    const attributeMap = new Map<number, Set<number>>();

    for (const attribute of aiAttributes) {
      const attributeId = this.extractPositiveInteger(
        attribute.attribute?.attribute_id,
      );

      if (!attributeId) {
        continue;
      }

      if (!attributeMap.has(attributeId)) {
        attributeMap.set(attributeId, new Set<number>());
      }

      for (const value of attribute.values ?? []) {
        let matchedValueId = this.extractPositiveInteger(value.matched_value_id);

        if (!matchedValueId && this.isNotExist(value.matched_value_id)) {
          const rawValue = this.extractSimpleText(value.original_value);
          matchedValueId = (
            await this.attributesService.addValue(
              attributeId,
              rawValue,
              rawValue,
            )
          ).id;
        }

        if (matchedValueId) {
          attributeMap.get(attributeId)?.add(matchedValueId);
        }
      }
    }

    return Array.from(attributeMap.entries())
      .map(([attribute_id, valueIds]) => ({
        attribute_id,
        attribute_value_ids: Array.from(valueIds).sort((left, right) => left - right),
      }))
      .filter((attribute) => attribute.attribute_value_ids.length > 0);
  }

  private isNotExist(value: unknown): boolean {
    return (
      typeof value === 'string' && value.trim().toLowerCase() === NOT_EXIST
    );
  }

  private extractLocalizedValue(value: unknown): {
    name_en: string;
    name_ar: string;
  } {
    const valueObject = this.getObject(value);
    const nameEn =
      this.requireOptionalString(valueObject?.name_en) ??
      this.extractSimpleText(value);
    const nameAr =
      this.requireOptionalString(valueObject?.name_ar) ??
      nameEn;

    return {
      name_en: nameEn,
      name_ar: nameAr,
    };
  }

  private extractSimpleText(value: unknown): string {
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
    }

    const valueObject = this.getObject(value);
    const candidate =
      this.requireOptionalString(valueObject?.name_en) ??
      this.requireOptionalString(valueObject?.value_en) ??
      this.requireOptionalString(valueObject?.name) ??
      this.requireOptionalString(valueObject?.value);

    if (!candidate) {
      throw new BadRequestException('AI returned an empty attribute/specification value.');
    }

    return candidate;
  }

  private async buildMedia(
    payload: NormalizedImportPayload,
  ): Promise<Array<{ media_id: number; is_primary: boolean; sort_order: number }>> {
    const directMedia = this.normalizeDirectMedia(payload.media);
    if (directMedia.length > 0) {
      return directMedia;
    }

    const orderedMediaSources: unknown[] = [];
    if (payload.image !== undefined && payload.image !== null) {
      orderedMediaSources.push(payload.image);
    }
    orderedMediaSources.push(...payload.images);

    if (!orderedMediaSources.length) {
      throw new BadRequestException(
        'The import payload must include image, images, or media.',
      );
    }

    const media: Array<{
      media_id: number;
      is_primary: boolean;
      sort_order: number;
    }> = [];
    const seenReferences = new Set<string>();

    for (const source of orderedMediaSources) {
      const resolved = await this.resolveMediaId(source);
      if (!resolved) {
        continue;
      }

      if (seenReferences.has(resolved.referenceKey)) {
        continue;
      }

      seenReferences.add(resolved.referenceKey);
      media.push({
        media_id: resolved.mediaId,
        is_primary: media.length === 0,
        sort_order: media.length,
      });
    }

    if (!media.length) {
      throw new BadRequestException(
        'The import payload must include at least one valid image reference.',
      );
    }

    return media;
  }

  private normalizeDirectMedia(
    mediaItems: unknown[],
  ): Array<{ media_id: number; is_primary: boolean; sort_order: number }> {
    const normalized: Array<{
      media_id: number;
      is_primary: boolean;
      sort_order: number;
    }> = [];
    const seenIds = new Set<number>();

    for (const [index, mediaItem] of mediaItems.entries()) {
      const mediaObject = this.getObject(mediaItem);
      const mediaId =
        this.extractPositiveInteger(mediaObject?.media_id) ??
        this.extractPositiveInteger(mediaObject?.id) ??
        this.extractPositiveInteger(mediaItem);

      if (!mediaId || seenIds.has(mediaId)) {
        continue;
      }

      seenIds.add(mediaId);
      normalized.push({
        media_id: mediaId,
        is_primary:
          typeof mediaObject?.is_primary === 'boolean'
            ? mediaObject.is_primary
            : normalized.length === 0,
        sort_order:
          this.extractNumber(mediaObject?.sort_order) ?? index,
      });
    }

    if (normalized.length > 1 && !normalized.some((item) => item.is_primary)) {
      normalized[0].is_primary = true;
    }

    return normalized;
  }

  private async resolveMediaId(
    mediaReference: unknown,
  ): Promise<{ mediaId: number; referenceKey: string } | null> {
    const parsedReference = this.parseMediaReference(mediaReference);

    if (!parsedReference) {
      return null;
    }

    if (parsedReference.kind === 'id') {
      return {
        mediaId: parsedReference.value,
        referenceKey: `id:${parsedReference.value}`,
      };
    }

    return {
      mediaId: await this.downloadImage(parsedReference.value),
      referenceKey: `url:${parsedReference.value}`,
    };
  }

  private parseMediaReference(
    mediaReference: unknown,
  ): { kind: 'id'; value: number } | { kind: 'url'; value: string } | null {
    if (mediaReference === null || mediaReference === undefined) {
      return null;
    }

    const numericId = this.extractPositiveInteger(mediaReference);
    if (numericId) {
      return {
        kind: 'id',
        value: numericId,
      };
    }

    if (typeof mediaReference === 'string') {
      const normalized = mediaReference.trim();

      if (!normalized || normalized.toLowerCase() === 'none') {
        return null;
      }

      return {
        kind: 'url',
        value: normalized,
      };
    }

    const mediaObject = this.getObject(mediaReference);
    if (!mediaObject) {
      return null;
    }

    return (
      this.parseMediaReference(mediaObject.media_id) ??
      this.parseMediaReference(mediaObject.url) ??
      this.parseMediaReference(mediaObject.id)
    );
  }

  private async downloadImage(imageUrl: string): Promise<number> {
    this.logger.log(`Downloading image ${imageUrl}`);
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new BadRequestException(
        `Failed to download image ${imageUrl}: ${response.status} ${response.statusText}`,
      );
    }

    const contentType =
      response.headers.get('content-type')?.split(';', 1)[0] ??
      'application/octet-stream';
    const buffer = Buffer.from(await response.arrayBuffer());
    const originalname = this.buildUploadFilename(imageUrl, contentType);
    const file = {
      fieldname: 'file',
      originalname,
      encoding: '7bit',
      mimetype: contentType,
      size: buffer.length,
      buffer,
      stream: Readable.from(buffer),
      destination: '',
      filename: originalname,
      path: '',
    } as Express.Multer.File;
    const media = await this.mediaService.uploadAndCreate(file, 'products');

    return media.id;
  }

  private buildUploadFilename(imageUrl: string, contentType: string): string {
    try {
      const pathname = new URL(imageUrl).pathname;
      const decodedName = decodeURIComponent(pathname.split('/').pop() ?? '');

      if (decodedName && extname(decodedName)) {
        return decodedName;
      }
    } catch {
      // Ignore malformed URLs and fall back to content type.
    }

    return `imported-image${this.guessExtensionFromContentType(contentType)}`;
  }

  private guessExtensionFromContentType(contentType: string): string {
    const normalizedType = contentType.toLowerCase();

    if (normalizedType.includes('jpeg')) return '.jpg';
    if (normalizedType.includes('png')) return '.png';
    if (normalizedType.includes('gif')) return '.gif';
    if (normalizedType.includes('webp')) return '.webp';
    if (normalizedType.includes('avif')) return '.avif';
    if (normalizedType.includes('tiff')) return '.tiff';

    return '.jpg';
  }

  private resolvePricing(payload: NormalizedImportPayload): {
    price: number;
    salePrice: number | null;
  } {
    const explicitPrice = this.firstDefinedValue([payload.price, payload.new_price]);
    const explicitSalePrice = this.firstDefinedValue([payload.sale_price]);

    if (explicitPrice !== undefined && explicitSalePrice !== undefined) {
      return {
        price: this.normalizePriceValue(explicitPrice),
        salePrice: this.normalizePriceValue(explicitSalePrice),
      };
    }

    const newPrice = this.normalizePriceValue(payload.new_price);
    if (!this.isMissingPrice(payload.old_price)) {
      return {
        price: this.normalizePriceValue(payload.old_price),
        salePrice: newPrice,
      };
    }

    return {
      price: newPrice,
      salePrice: null,
    };
  }

  private resolveOutOfStock(payload: NormalizedImportPayload): boolean {
    const quantity = this.extractNumber(payload.quantity);
    if (quantity !== null) {
      return quantity <= 0;
    }

    if (typeof payload.stock === 'boolean') {
      return !payload.stock;
    }

    const stockValue = this.requireOptionalString(payload.stock)?.toLowerCase();
    return !!stockValue && ['none', '0', 'false', 'out_of_stock'].includes(stockValue);
  }

  private resolveQuantity(
    payload: NormalizedImportPayload,
    isOutOfStock: boolean,
  ): number {
    if (isOutOfStock) {
      return 0;
    }

    const quantity = this.extractNumber(payload.quantity);
    if (quantity !== null && quantity >= 0) {
      return quantity;
    }

    const stockQuantity = this.extractNumber(payload.stock);
    if (stockQuantity !== null && stockQuantity >= 0) {
      return stockQuantity;
    }

    return 100;
  }

  private normalizePriceValue(value: unknown): number {
    if (typeof value === 'number') {
      return value;
    }

    const valueObject = this.getObject(value);
    const nestedValue = valueObject?.translate;
    const candidate =
      nestedValue !== undefined && nestedValue !== null ? nestedValue : value;

    if (typeof candidate === 'number') {
      return candidate;
    }

    if (typeof candidate !== 'string') {
      throw new BadRequestException(`Invalid price value: ${String(candidate)}`);
    }

    const normalized = candidate.trim();
    if (!normalized || normalized.toLowerCase() === 'none') {
      throw new BadRequestException(`Invalid price value: ${candidate}`);
    }

    const parsed = Number(normalized.replace(/,/g, ''));
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(`Invalid price value: ${candidate}`);
    }

    return parsed;
  }

  private isMissingPrice(value: unknown): boolean {
    if (value === null || value === undefined) {
      return true;
    }

    if (typeof value === 'string') {
      return !value.trim() || value.trim().toLowerCase() === 'none';
    }

    const valueObject = this.getObject(value);
    if (valueObject) {
      const translated = valueObject.translate;
      return this.isMissingPrice(translated);
    }

    return false;
  }

  private buildSystemPrompt(
    brands: Brand[],
    specifications: Specification[],
    attributes: Attribute[],
  ): string {
    const brandsCatalog = brands
      .map((brand) => brand.name_en?.trim())
      .filter((name): name is string => !!name);
    const specificationsCatalog = specifications.map((specification) => ({
      id: specification.id,
      name_en: specification.name_en,
      name_ar: specification.name_ar,
      unit_en: specification.unit_en,
      unit_ar: specification.unit_ar,
      allow_ai_inference: specification.allow_ai_inference,
      values: (specification.values ?? [])
        .filter((value) => value.is_active)
        .map((value) => ({
          id: value.id,
          value_en: value.value_en,
          value_ar: value.value_ar,
        })),
    }));
    const attributesCatalog = attributes.map((attribute) => ({
      id: attribute.id,
      name_en: attribute.name_en,
      name_ar: attribute.name_ar,
      type: attribute.type,
      is_color: attribute.is_color,
      allow_ai_inference: attribute.allow_ai_inference,
      values: (attribute.values ?? [])
        .filter((value) => value.is_active)
        .map((value) => ({
          id: value.id,
          value_en: value.value_en,
          value_ar: value.value_ar,
          color_code: value.color_code,
        })),
    }));

    return `You are an expert ecommerce data entry specialist and SEO optimizer.

Your job is to receive a raw product and return a fully optimized, clean product ready for publishing.

DATABASE BRANDS:
${JSON.stringify(brandsCatalog, null, 2)}

DATABASE SPECIFICATIONS:
${JSON.stringify(specificationsCatalog, null, 2)}

DATABASE ATTRIBUTES:
${JSON.stringify(attributesCatalog, null, 2)}

Instructions:

0. BRAND:
    - The source brand may be missing.
    - Use DATABASE BRANDS plus the title/description to infer the correct brand when possible.
    - Return brand_name as the exact English brand name from DATABASE BRANDS.
    - If no confident brand match exists, return null.

1. TITLE:
    - Rewrite the title to be SEO-friendly, clear, and concise.
    - Translate the optimized title to Arabic.

2. DESCRIPTION:
    - Rewrite the description to be engaging, informative, and SEO-optimized.
    - Format it as clean HTML using tags like <ul>, <li>, <strong> with no inline styles and no classes.
    - Structure it as a bullet list.
    - If any specification has no match in the database (specification_id = "not_exist"), append it naturally into the HTML description.
    - If any attribute has no match in the database (attribute_id = "not_exist"), append it naturally into the HTML description.
    - Translate the full HTML description to Arabic while keeping the HTML tags.

3. SPECIFICATIONS:
    STEP 1 - EXTRACT:
        - Read the product title word by word. Pull out every measurable or descriptive value.
        - Read the product description sentence by sentence. Pull out every measurable or descriptive value.
        - Read every raw specification key-value pair.
        - Combine all extracted values into a single master list.

    STEP 2 - CLASSIFY AND MATCH:
        - Go through the DATABASE SPECIFICATIONS list from top to bottom.
        - Pay strict attention to allow_ai_inference for each specification.
        - If allow_ai_inference is false, the metric must exist in the source data. You may match synonyms, typos, and slight naming variations.
        - If allow_ai_inference is true, you must deduce the value based on the available evidence.

    STEP 3 - BUILD the specifications array:
        - For every found or inferred specification:
            * If the exact value exists in DB, return matched_value_id as the integer id.
            * If the exact value does not exist in DB, return matched_value_id as "not_exist" and put the raw string in original_value.name_en.
        - Skip only the specifications that are truly not found.

4. ATTRIBUTES:
    STEP 1 - EXTRACT:
        - Read the product title and description for color, size, material, language, or variant.
        - Read every raw attribute field.

    STEP 2 - CLASSIFY AND MATCH:
        - Go through the DATABASE ATTRIBUTES list from top to bottom.
        - Pay strict attention to allow_ai_inference for each attribute.
        - If allow_ai_inference is false, the value must exist in the source data. You may match synonyms, typos, and slight naming variations.
        - If allow_ai_inference is true, you may infer applicable values from context.

    STEP 3 - BUILD the attributes array:
        - Attributes can have multiple values.
        - If the exact value exists in DB, return matched_value_id as the integer id.
        - If the exact value does not exist in DB, return matched_value_id as "not_exist" and put the raw string in original_value.
        - Skip only the attributes that are truly not found.

5. META DESCRIPTION must be 160 characters or fewer.
6. META TITLE must be 70 characters or fewer.
7. SHORT DESCRIPTION must be the 4 most important points as clean HTML bullet list.

STRICT RULES:
    1. Output JSON only.
    2. No markdown.
    3. No comments.

Respond only with a JSON object in this exact format:
{
  "brand_name": "<exact english brand name from database> or null",
  "title_en": "<seo optimized title in english>",
  "title_ar": "<seo optimized title in arabic>",
  "meta_title_en": "<meta seo optimized title in english>",
  "meta_title_ar": "<meta seo optimized title in arabic>",
  "short_description_en": "<4 most important points as HTML bullet list in english>",
  "short_description_ar": "<4 most important points as HTML bullet list in arabic>",
  "description_en": "<full HTML formatted description in english>",
  "description_ar": "<full HTML formatted description in arabic>",
  "meta_description_en": "<meta seo optimized description in english, max 160 chars>",
  "meta_description_ar": "<meta seo optimized description in arabic, max 160 chars>",
  "specifications": [
    {
      "specification_id": 1,
      "values": [
        {
          "original_value": {
            "name_en": "<raw extracted value in english>",
            "name_ar": "<arabic translation if text, same as name_en if technical>"
          },
          "matched_value_id": 10
        }
      ]
    }
  ],
  "attributes": [
    {
      "attribute": {
        "original_value": "<string>",
        "attribute_id": 1
      },
      "values": [
        {
          "original_value": "<raw extracted value string>",
          "matched_value_id": 10
        }
      ]
    }
  ]
}`;
  }

  private getObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private firstNonEmptyString(values: unknown[]): string | null {
    for (const value of values) {
      const normalized = this.requireOptionalString(value);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private firstDefinedValue(values: unknown[]): unknown {
    for (const value of values) {
      if (value !== undefined && value !== null) {
        return value;
      }
    }

    return undefined;
  }

  private requireString(value: unknown, fieldName: string): string {
    const normalized = this.requireOptionalString(value);
    if (!normalized) {
      throw new BadRequestException(`${fieldName} is missing in the AI response.`);
    }

    return normalized;
  }

  private requireOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private extractPositiveInteger(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isInteger(value) && value > 0 ? value : null;
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (!normalized) {
        return null;
      }

      const parsed = Number(normalized);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }

    return null;
  }

  private extractFirstPositiveInteger(value: unknown): number | null {
    if (!Array.isArray(value)) {
      return null;
    }

    for (const item of value) {
      const parsed = this.extractPositiveInteger(item);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private extractNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (!normalized) {
        return null;
      }

      const parsed = Number(normalized.replace(/,/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }
}