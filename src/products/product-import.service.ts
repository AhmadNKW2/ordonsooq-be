import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { appendFile, mkdir } from 'fs/promises';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { dirname, extname, isAbsolute, resolve as resolvePath } from 'path';
import { Readable } from 'stream';
import { AttributesService } from '../attributes/attributes.service';
import { Attribute } from '../attributes/entities/attribute.entity';
import { BrandsService } from '../brands/brands.service';
import { MediaService } from '../media/media.service';
import { Brand, BrandStatus } from '../brands/entities/brand.entity';
import { Specification } from '../specifications/entities/specification.entity';
import { SpecificationsService } from '../specifications/specifications.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductStatus } from './entities/product.entity';
import { buildProductImportSystemPrompt } from './prompts/product-import-system.prompt';
import { ProductsService } from './products.service';

const OPEN_AI_NOT_EXIST_SENTINEL = 'not_exist';
const INTERNAL_NEW_VALUE_MATCH = Symbol('internal_new_value_match');
const NUMERIC_TOKEN_REGEX = /\d+(?:\.\d+)?/g;
const DEFAULT_OPENAI_LOG_PATH = resolvePath(
  process.cwd(),
  'logs',
  'import_product_openai.jsonl',
);

interface ImportDefinitionValue {
  id?: number | null;
  value_en?: string | null;
  value_ar?: string | null;
}

interface ImportDefinition {
  id: number;
  name_en?: string | null;
  name_ar?: string | null;
  unit_en?: string | null;
  unit_ar?: string | null;
  allow_ai_inference?: boolean | null;
  values?: ImportDefinitionValue[];
}

interface ParsedImportRequest {
  payload: NormalizedImportPayload;
  categoryId: number;
  vendorId: number;
  model: string;
  sourceFile: string | null;
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

interface InternalDefinitionValueState {
  [INTERNAL_NEW_VALUE_MATCH]?: true;
}

interface ImportAiSpecificationValue extends InternalDefinitionValueState {
  original_value?: unknown;
  matched_value_id?: unknown;
}

interface ImportAiSpecification {
  specification_id?: unknown;
  values?: ImportAiSpecificationValue[];
}

interface ImportAiAttributeValue extends InternalDefinitionValueState {
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

type ImportAiDefinitionValue =
  | ImportAiSpecificationValue
  | ImportAiAttributeValue;

interface ParsedDefinitionValue {
  displayValue: string;
  rawCandidates: string[];
  createValueNameEn: string;
  createValueNameAr: string;
}

interface ProductImportCatalog {
  brands: Brand[];
  specifications: Specification[];
  attributes: Attribute[];
}

interface OpenAiInputMessage {
  role: 'system' | 'user';
  content: string;
}

interface OpenAiHttpResponse {
  ok: boolean;
  status: number;
  responseText: string;
  responseBody: unknown;
}

interface ParsedOpenAiResponse {
  rawOutputText: string;
  parsedOutput: ImportAiResult;
}

interface OpenAiLogContext {
  model: string;
  openAiInput: OpenAiInputMessage[];
  rawProductInput: NormalizedImportPayload;
  sourceFile: string | null;
  openAiResponse?: unknown;
  rawOutputText?: string | null;
  parsedOutput?: ImportAiResult;
  errorMessage?: string;
}

type ValueMatch =
  | { type: 'existing'; matchedValueId: number }
  | { type: 'new' };

type DefinitionValueMatch = ValueMatch & {
  rawValue: string;
};

type DefinitionValueReference = InternalDefinitionValueState & {
  matched_value_id?: number;
};

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
    private readonly brandsService: BrandsService,
  ) {}

  async importFromRequest(body: Record<string, unknown>, userId?: number) {
    try {
      const request = this.parseRequest(body);
      const catalog = await this.loadImportCatalog(request.categoryId);
      const aiResult = await this.callOpenAi(
        request.payload,
        catalog,
        request.model,
        request.sourceFile,
      );
      const createProductDto = await this.buildCreateProductDto(
        request,
        aiResult,
        catalog,
      );
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
      process.env.OPENAI_MODEL?.trim() ??
      'gpt-5.4';
    const sourceFile =
      this.requireOptionalString(body.source_file) ??
      this.requireOptionalString(rawPayload.source_file) ??
      null;

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
      sourceFile,
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
    catalog: ProductImportCatalog,
    model: string,
    sourceFile: string | null,
  ): Promise<ImportAiResult> {
    const openAiInput = this.buildOpenAiInput(payload, catalog);

    let openAiResponse: unknown = null;
    let rawOutputText: string | null = null;

    try {
      const response = await this.fetchOpenAiResponse(
        model,
        openAiInput,
        this.getOpenAiApiKey(),
      );
      openAiResponse = response.responseBody;

      if (!response.ok) {
        throw new BadRequestException(
          `OpenAI error ${response.status}: ${response.responseText}`,
        );
      }

      const parsedResponse = this.parseOpenAiResponse(openAiResponse);
      rawOutputText = parsedResponse.rawOutputText;

      await this.logOpenAiInteraction({
        model,
        openAiInput,
        rawProductInput: payload,
        sourceFile,
        openAiResponse,
        rawOutputText,
        parsedOutput: parsedResponse.parsedOutput,
      });

      return parsedResponse.parsedOutput;
    } catch (error) {
      await this.logOpenAiInteraction({
        model,
        openAiInput,
        rawProductInput: payload,
        sourceFile,
        openAiResponse,
        rawOutputText,
        errorMessage: getErrorMessage(error),
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `OpenAI returned invalid JSON: ${getErrorMessage(error)}`,
      );
    }
  }

  private async loadImportCatalog(
    categoryId: number,
  ): Promise<ProductImportCatalog> {
    const [brands, specifications, attributes] = await Promise.all([
      this.findActiveBrands(),
      this.specificationsService.findAll([categoryId]),
      this.attributesService.findAll([categoryId]),
    ]);

    return {
      brands,
      specifications: specifications.filter(
        (specification) => specification.is_active,
      ),
      attributes: attributes.filter((attribute) => attribute.is_active),
    };
  }

  private async buildCreateProductDto(
    request: ParsedImportRequest,
    aiResult: ImportAiResult,
    catalog: ProductImportCatalog,
  ): Promise<CreateProductDto> {
    const enforcedSpecifications = this.enforceRequiredSpecifications(
      request.payload,
      aiResult.specifications ?? [],
      catalog.specifications,
    );
    const enforcedAttributes = this.enforceRequiredAttributes(
      request.payload,
      aiResult.attributes ?? [],
      catalog.attributes,
    );
    const [specificationsPayload, attributesPayload, media, brandId] =
      await Promise.all([
        this.resolveSpecifications(
          enforcedSpecifications,
          catalog.specifications,
        ),
        this.resolveAttributes(enforcedAttributes, catalog.attributes),
        this.buildMedia(request.payload),
        this.resolveBrandForImport(
          catalog.brands,
          request.payload,
          aiResult.brand_name,
        ),
      ]);
    const pricing = this.resolvePricing(request.payload);
    const isOutOfStock = this.resolveOutOfStock(request.payload);
    const quantity = this.resolveQuantity(request.payload, isOutOfStock);

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

    this.applyAiMetadata(createProductDto, aiResult);
    this.applyPayloadMetadata(createProductDto, request.payload);
    this.applyCommercialFields(createProductDto, pricing.salePrice, brandId);

    return createProductDto;
  }

  private applyAiMetadata(
    createProductDto: CreateProductDto,
    aiResult: ImportAiResult,
  ): void {
    const metaTitleEn = this.requireOptionalString(aiResult.meta_title_en);
    const metaTitleAr = this.requireOptionalString(aiResult.meta_title_ar);
    const metaDescriptionEn = this.requireOptionalString(
      aiResult.meta_description_en,
    );
    const metaDescriptionAr = this.requireOptionalString(
      aiResult.meta_description_ar,
    );

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
  }

  private applyPayloadMetadata(
    createProductDto: CreateProductDto,
    payload: NormalizedImportPayload,
  ): void {
    const sku = this.requireOptionalString(payload.sku);
    const record = this.requireOptionalString(payload.record);

    if (payload.reference_link) {
      createProductDto.reference_link = payload.reference_link;
    }

    if (sku) {
      createProductDto.sku = sku;
    }

    if (record) {
      createProductDto.record = record;
    }
  }

  private applyCommercialFields(
    createProductDto: CreateProductDto,
    salePrice: number | null,
    brandId: number | null,
  ): void {
    if (salePrice !== null) {
      createProductDto.sale_price = salePrice;
    }

    if (brandId !== null) {
      createProductDto.brand_id = brandId;
    }
  }

  private async resolveBrandForImport(
    brands: Brand[],
    payload: NormalizedImportPayload,
    aiBrandName: unknown,
  ): Promise<number | null> {
    const { brandId, brandName, brandCreated } =
      await this.resolveOrCreateBrand(brands, payload, aiBrandName);

    if (brandId !== null && brandName) {
      this.logger.log(
        `${brandCreated ? 'Created' : 'Resolved'} brand '${brandName}' -> id=${brandId}`,
      );
      return brandId;
    }

    this.logger.log(
      'No brand resolved from source data or AI; creating product without brand_id.',
    );

    return null;
  }

  private buildOpenAiInput(
    payload: NormalizedImportPayload,
    catalog: ProductImportCatalog,
  ): OpenAiInputMessage[] {
    return [
      {
        role: 'system',
        content: buildProductImportSystemPrompt(catalog),
      },
      {
        role: 'user',
        content: this.buildOpenAiUserPrompt(payload),
      },
    ];
  }

  private buildOpenAiUserPrompt(payload: NormalizedImportPayload): string {
    return JSON.stringify(
      {
        brand: payload.brand,
        title: payload.title,
        description: payload.description,
        specification: payload.specification,
        attributes: payload.attributes,
      },
      null,
      2,
    );
  }

  private getOpenAiApiKey(): string {
    const openAiKey = process.env.OPENAI_API_KEY?.trim();

    if (!openAiKey) {
      throw new BadRequestException(
        'Missing OPENAI_API_KEY environment variable.',
      );
    }

    return openAiKey;
  }

  private async fetchOpenAiResponse(
    model: string,
    input: OpenAiInputMessage[],
    openAiKey: string,
  ): Promise<OpenAiHttpResponse> {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model,
        input,
      }),
    });
    const responseText = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      responseText,
      responseBody: this.tryParseJson(responseText) ?? responseText,
    };
  }

  private parseOpenAiResponse(responseBody: unknown): ParsedOpenAiResponse {
    const body = this.getObject(responseBody);
    if (!body) {
      throw new BadRequestException('OpenAI response was not a JSON object.');
    }

    const rawOutputText = this.stripCodeFences(this.extractOpenAiText(body));

    return {
      rawOutputText,
      parsedOutput: JSON.parse(rawOutputText) as ImportAiResult,
    };
  }

  private async logOpenAiInteraction(input: OpenAiLogContext): Promise<void> {
    await this.appendOpenAiLog(this.buildOpenAiLogEntry(input));
  }

  private tryParseJson(value: string): unknown | null {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
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

    throw new BadRequestException(
      'OpenAI response did not include text output.',
    );
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

  private async resolveOrCreateBrand(
    brands: Brand[],
    payload: NormalizedImportPayload,
    aiBrandName: unknown,
  ): Promise<{
    brandId: number | null;
    brandName: string | null;
    brandCreated: boolean;
  }> {
    const resolvedBrand = this.resolveOptionalBrand(
      brands,
      payload,
      aiBrandName,
    );

    if (resolvedBrand.brandId !== null) {
      return {
        ...resolvedBrand,
        brandCreated: false,
      };
    }

    const sourceBrandName = this.requireOptionalString(payload.brand);
    if (!sourceBrandName) {
      return {
        brandId: null,
        brandName: null,
        brandCreated: false,
      };
    }

    try {
      const createdBrand = await this.brandsService.create({
        name_en: sourceBrandName,
        name_ar: sourceBrandName,
      });
      brands.push(createdBrand);

      return {
        brandId: createdBrand.id,
        brandName: createdBrand.name_en?.trim() || sourceBrandName,
        brandCreated: true,
      };
    } catch (error) {
      const refreshedBrands = await this.findActiveBrands();
      const refreshedBrand = this.resolveOptionalBrand(
        refreshedBrands,
        payload,
        aiBrandName,
      );

      if (refreshedBrand.brandId !== null) {
        return {
          ...refreshedBrand,
          brandCreated: false,
        };
      }

      throw error;
    }
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

  private dedupeNonEmptyStrings(values: string[]): string[] {
    const deduped: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
      const normalized = value.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      deduped.push(normalized);
    }

    return deduped;
  }

  private getDefinitionDisplayName(definition: ImportDefinition): string {
    return (
      definition.name_en?.trim() ||
      definition.name_ar?.trim() ||
      String(definition.id)
    );
  }

  private extractDefinitionUnits(definition: ImportDefinition): string[] {
    return this.dedupeNonEmptyStrings([
      definition.unit_en ?? '',
      definition.unit_ar ?? '',
    ]);
  }

  private hasDefinedUnit(definition: ImportDefinition): boolean {
    return this.extractDefinitionUnits(definition).length > 0;
  }

  private buildDefinitionValueCandidates(
    definition: ImportDefinition,
    matchedValue: ImportDefinitionValue,
  ): string[] {
    const baseCandidates = this.dedupeNonEmptyStrings([
      matchedValue.value_en ?? '',
      matchedValue.value_ar ?? '',
    ]);
    const unitCandidates = this.extractDefinitionUnits(definition);

    if (!unitCandidates.length) {
      return baseCandidates;
    }

    return this.dedupeNonEmptyStrings([
      ...baseCandidates,
      ...baseCandidates.flatMap((baseCandidate) =>
        unitCandidates.map(
          (unitCandidate) => `${baseCandidate} ${unitCandidate}`,
        ),
      ),
    ]);
  }

  private extractNumericSignature(value: string): string[] {
    return (value.replace(/,/g, '').match(NUMERIC_TOKEN_REGEX) ?? []).filter(
      Boolean,
    );
  }

  private buildExistingValueMap(
    definition: ImportDefinition,
  ): Map<number, ImportDefinitionValue> {
    return new Map(
      (definition.values ?? [])
        .filter(
          (value): value is ImportDefinitionValue & { id: number } =>
            typeof value.id === 'number',
        )
        .map((value) => [value.id, value]),
    );
  }

  private findExactMatchedValueId(
    definition: ImportDefinition,
    rawValue: string,
  ): number | null {
    const normalizedRawValue = this.normalizeLookupText(rawValue);
    const rawNumericSignature =
      this.extractNumericSignature(rawValue).join('|');

    for (const value of definition.values ?? []) {
      if (typeof value.id !== 'number') {
        continue;
      }

      const normalizedCandidates = new Set(
        this.buildDefinitionValueCandidates(definition, value).map(
          (candidate) => this.normalizeLookupText(candidate),
        ),
      );
      if (normalizedCandidates.has(normalizedRawValue)) {
        return value.id;
      }

      if (this.hasDefinedUnit(definition) && rawNumericSignature) {
        const candidateSignatures = new Set(
          this.buildDefinitionValueCandidates(definition, value)
            .map((candidate) =>
              this.extractNumericSignature(candidate).join('|'),
            )
            .filter(Boolean),
        );
        if (candidateSignatures.has(rawNumericSignature)) {
          return value.id;
        }
      }
    }

    return null;
  }

  private analyzeApproximateMatch(
    rawCandidates: string[],
    matchedCandidates: string[],
  ): {
    shouldReplace: boolean;
    reason: string;
  } {
    const normalizedMatchedCandidates = new Set(
      matchedCandidates
        .map((candidate) => this.normalizeLookupText(candidate))
        .filter(Boolean),
    );
    const matchedNumericSignatures = new Set(
      matchedCandidates
        .map((candidate) => this.extractNumericSignature(candidate).join('|'))
        .filter(Boolean),
    );

    let hasMeasurableRawValue = false;

    for (const rawCandidate of rawCandidates) {
      const normalizedRawCandidate = rawCandidate.trim();
      if (!normalizedRawCandidate) {
        continue;
      }

      if (
        normalizedMatchedCandidates.has(
          this.normalizeLookupText(normalizedRawCandidate),
        )
      ) {
        return {
          shouldReplace: false,
          reason:
            'raw value matches an existing database value after normalization',
        };
      }

      const rawNumericSignature = this.extractNumericSignature(
        normalizedRawCandidate,
      ).join('|');
      if (rawNumericSignature) {
        hasMeasurableRawValue = true;
        if (matchedNumericSignatures.has(rawNumericSignature)) {
          return {
            shouldReplace: false,
            reason: 'raw value matches an existing database numeric signature',
          };
        }
      }
    }

    if (hasMeasurableRawValue) {
      return {
        shouldReplace: true,
        reason:
          'raw measurable value differs from all existing unit-based database values',
      };
    }

    return {
      shouldReplace: false,
      reason:
        'raw value has no measurable token; approximate numeric safeguard not applied',
    };
  }

  private resolveValueMatch(value: ImportAiDefinitionValue): ValueMatch | null {
    const matchedValueId = this.extractPositiveInteger(value.matched_value_id);

    if (matchedValueId) {
      return {
        type: 'existing',
        matchedValueId,
      };
    }

    if (this.hasInternalNewValueMatch(value)) {
      return { type: 'new' };
    }

    if (this.isOpenAiNotExistSentinel(value.matched_value_id)) {
      return { type: 'new' };
    }

    return null;
  }

  private hasInternalNewValueMatch(value: ImportAiDefinitionValue): boolean {
    return value[INTERNAL_NEW_VALUE_MATCH] === true;
  }

  private collectAiValuesByDefinition<TEntry, TValue>(
    entries: TEntry[],
    getDefinitionId: (entry: TEntry) => number | null,
    getValues: (entry: TEntry) => TValue[] | undefined,
  ): Map<number, TValue[]> {
    const valuesByDefinition = new Map<number, TValue[]>();

    for (const entry of entries) {
      const definitionId = getDefinitionId(entry);
      if (!definitionId) {
        continue;
      }

      valuesByDefinition.set(definitionId, [
        ...(valuesByDefinition.get(definitionId) ?? []),
        ...(getValues(entry) ?? []),
      ]);
    }

    return valuesByDefinition;
  }

  private enforceRequiredDefinitionValues<
    TDefinition extends ImportDefinition,
    TAiEntry,
    TValue extends ImportAiDefinitionValue,
    TResult,
  >(
    aiEntries: TAiEntry[],
    availableDefinitions: TDefinition[],
    input: {
      getDefinitionId: (entry: TAiEntry) => number | null;
      getValues: (entry: TAiEntry) => TValue[] | undefined;
      definitionKind: 'specification' | 'attribute';
      buildResult: (definition: TDefinition, values: TValue[]) => TResult;
    },
  ): TResult[] {
    const aiValuesByDefinition = this.collectAiValuesByDefinition(
      aiEntries,
      input.getDefinitionId,
      input.getValues,
    );
    const mergedDefinitions: TResult[] = [];
    const missingInferenceDefinitions: string[] = [];

    for (const definition of availableDefinitions) {
      const values = [...(aiValuesByDefinition.get(definition.id) ?? [])];

      if (!values.length) {
        if (definition.allow_ai_inference) {
          missingInferenceDefinitions.push(
            this.getDefinitionDisplayName(definition),
          );
        }

        continue;
      }

      mergedDefinitions.push(input.buildResult(definition, values));
    }

    if (missingInferenceDefinitions.length) {
      throw new BadRequestException(
        `AI inference is required but missing for ${input.definitionKind}s: ${missingInferenceDefinitions.join(', ')}`,
      );
    }

    return mergedDefinitions;
  }

  private async resolveDefinitionValues<
    TDefinition extends ImportDefinition,
    TAiEntry,
    TValue extends ImportAiDefinitionValue,
    TResult,
  >(
    aiEntries: TAiEntry[],
    availableDefinitions: TDefinition[],
    input: {
      getDefinitionId: (entry: TAiEntry) => number | null;
      getValues: (entry: TAiEntry) => TValue[] | undefined;
      definitionKind: 'specification' | 'attribute';
      parseValue: (value: TValue) => ParsedDefinitionValue;
      createValue: (
        definitionId: number,
        parsedValue: ParsedDefinitionValue,
      ) => Promise<number>;
      buildResult: (definitionId: number, valueIds: number[]) => TResult;
    },
  ): Promise<TResult[]> {
    const definitionLookup = new Map(
      availableDefinitions.map((definition) => [definition.id, definition]),
    );
    const definitionMap = new Map<number, Set<number>>();
    const definitionKindLabel =
      input.definitionKind.charAt(0).toUpperCase() +
      input.definitionKind.slice(1);

    for (const entry of aiEntries) {
      const definitionId = input.getDefinitionId(entry);

      if (!definitionId) {
        continue;
      }

      if (!definitionLookup.has(definitionId)) {
        this.logger.log(
          `Skipping unknown ${input.definitionKind} id=${definitionId} returned by AI.`,
        );
        continue;
      }

      if (!definitionMap.has(definitionId)) {
        definitionMap.set(definitionId, new Set<number>());
      }

      const matchedDefinition = definitionLookup.get(definitionId);
      if (!matchedDefinition) {
        continue;
      }

      const valueLookup = this.buildExistingValueMap(matchedDefinition);

      for (const value of input.getValues(entry) ?? []) {
        const valueMatch = this.resolveValueMatch(value);
        let matchedValueId =
          valueMatch?.type === 'existing' ? valueMatch.matchedValueId : null;
        let shouldCreateValue = valueMatch?.type === 'new';
        const parsedValue = input.parseValue(value);

        if (matchedValueId) {
          const matchedValue = valueLookup.get(matchedValueId);

          if (!matchedValue) {
            this.logger.log(
              `${definitionKindLabel} ${definitionId}: AI returned unknown value id=${matchedValueId} for '${parsedValue.displayValue}'; creating new value.`,
            );
            matchedValueId = null;
            shouldCreateValue = true;
          } else if (this.hasDefinedUnit(matchedDefinition)) {
            const matchDecision = this.analyzeApproximateMatch(
              parsedValue.rawCandidates,
              this.buildDefinitionValueCandidates(
                matchedDefinition,
                matchedValue,
              ),
            );

            if (matchDecision.shouldReplace) {
              this.logger.log(
                `${definitionKindLabel} ${definitionId}: rejecting approximate match id=${matchedValueId} for raw value '${parsedValue.displayValue}'; creating exact value (${matchDecision.reason}).`,
              );
              matchedValueId = null;
              shouldCreateValue = true;
            } else {
              this.logger.log(
                `${definitionKindLabel} ${definitionId}: keeping matched value id=${matchedValueId} for raw value '${parsedValue.displayValue}' (${matchDecision.reason}).`,
              );
            }
          } else {
            this.logger.log(
              `${definitionKindLabel} ${definitionId}: keeping matched value id=${matchedValueId} for raw value '${parsedValue.displayValue}' (no unit defined; approximate numeric safeguard not applied).`,
            );
          }
        }

        if (!matchedValueId && shouldCreateValue) {
          this.logger.log(
            `${definitionKindLabel} ${definitionId}: creating missing value '${parsedValue.displayValue}'.`,
          );
          matchedValueId = await input.createValue(definitionId, parsedValue);
          this.logger.log(
            `${definitionKindLabel} ${definitionId}: created value id=${matchedValueId}`,
          );
        }

        if (matchedValueId) {
          definitionMap.get(definitionId)?.add(matchedValueId);
        }
      }
    }

    return Array.from(definitionMap.entries())
      .filter(([, valueIds]) => valueIds.size > 0)
      .map(([definitionId, valueIds]) =>
        input.buildResult(
          definitionId,
          Array.from(valueIds).sort((left, right) => left - right),
        ),
      );
  }

  private enforceRequiredSpecifications(
    payload: NormalizedImportPayload,
    aiSpecifications: ImportAiSpecification[],
    availableSpecifications: Specification[],
  ): ImportAiSpecification[] {
    void payload;

    return this.enforceRequiredDefinitionValues(
      aiSpecifications,
      availableSpecifications,
      {
        getDefinitionId: (specification) =>
          this.extractPositiveInteger(specification.specification_id),
        getValues: (specification) => specification.values,
        definitionKind: 'specification',
        buildResult: (specification, values) => ({
          specification_id: specification.id,
          values,
        }),
      },
    );
  }

  private enforceRequiredAttributes(
    payload: NormalizedImportPayload,
    aiAttributes: ImportAiAttribute[],
    availableAttributes: Attribute[],
  ): ImportAiAttribute[] {
    void payload;

    return this.enforceRequiredDefinitionValues(
      aiAttributes,
      availableAttributes,
      {
        getDefinitionId: (attribute) =>
          this.extractPositiveInteger(attribute.attribute?.attribute_id),
        getValues: (attribute) => attribute.values,
        definitionKind: 'attribute',
        buildResult: (attribute, values) => ({
          attribute: {
            attribute_id: attribute.id,
            original_value: this.getDefinitionDisplayName(attribute),
          },
          values,
        }),
      },
    );
  }

  private async resolveSpecifications(
    aiSpecifications: ImportAiSpecification[],
    availableSpecifications: Specification[],
  ): Promise<
    Array<{
      specification_id: number;
      specification_value_ids: number[];
    }>
  > {
    return this.resolveDefinitionValues(
      aiSpecifications,
      availableSpecifications,
      {
        getDefinitionId: (specification) =>
          this.extractPositiveInteger(specification.specification_id),
        getValues: (specification) => specification.values,
        definitionKind: 'specification',
        parseValue: (value) => {
          const localizedValue = this.extractLocalizedValue(
            value.original_value,
          );

          return {
            displayValue: localizedValue.name_en,
            rawCandidates: [localizedValue.name_en, localizedValue.name_ar],
            createValueNameEn: localizedValue.name_en,
            createValueNameAr: localizedValue.name_ar,
          };
        },
        createValue: async (specificationId, parsedValue) =>
          (
            await this.specificationsService.addValue(
              specificationId,
              parsedValue.createValueNameEn,
              parsedValue.createValueNameAr,
            )
          ).id,
        buildResult: (specificationId, valueIds) => ({
          specification_id: specificationId,
          specification_value_ids: valueIds,
        }),
      },
    );
  }

  private async resolveAttributes(
    aiAttributes: ImportAiAttribute[],
    availableAttributes: Attribute[],
  ): Promise<
    Array<{
      attribute_id: number;
      attribute_value_ids: number[];
    }>
  > {
    return this.resolveDefinitionValues(aiAttributes, availableAttributes, {
      getDefinitionId: (attribute) =>
        this.extractPositiveInteger(attribute.attribute?.attribute_id),
      getValues: (attribute) => attribute.values,
      definitionKind: 'attribute',
      parseValue: (value) => {
        const rawValue = this.extractSimpleText(value.original_value);

        return {
          displayValue: rawValue,
          rawCandidates: [rawValue],
          createValueNameEn: rawValue,
          createValueNameAr: rawValue,
        };
      },
      createValue: async (attributeId, parsedValue) =>
        (
          await this.attributesService.addValue(
            attributeId,
            parsedValue.createValueNameEn,
            parsedValue.createValueNameAr,
          )
        ).id,
      buildResult: (attributeId, valueIds) => ({
        attribute_id: attributeId,
        attribute_value_ids: valueIds,
      }),
    });
  }

  private isOpenAiNotExistSentinel(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      value.trim().toLowerCase() === OPEN_AI_NOT_EXIST_SENTINEL
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
    const nameAr = this.requireOptionalString(valueObject?.name_ar) ?? nameEn;

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
      throw new BadRequestException(
        'AI returned an empty attribute/specification value.',
      );
    }

    return candidate;
  }

  private async buildMedia(
    payload: NormalizedImportPayload,
  ): Promise<
    Array<{ media_id: number; is_primary: boolean; sort_order: number }>
  > {
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
        sort_order: this.extractNumber(mediaObject?.sort_order) ?? index,
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
    const explicitPrice = this.firstDefinedValue([
      payload.price,
      payload.new_price,
    ]);
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
    return (
      !!stockValue &&
      ['none', '0', 'false', 'out_of_stock'].includes(stockValue)
    );
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
      throw new BadRequestException(
        `Invalid price value: ${String(candidate)}`,
      );
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

  private async findActiveBrands(): Promise<Brand[]> {
    return this.brandsRepository.find({
      where: { status: BrandStatus.ACTIVE },
      order: { name_en: 'ASC' },
    });
  }

  private getOpenAiLogPath(): string {
    const configuredPath = process.env.PRODUCT_IMPORT_OPENAI_LOG_PATH?.trim();

    if (!configuredPath) {
      return DEFAULT_OPENAI_LOG_PATH;
    }

    return isAbsolute(configuredPath)
      ? configuredPath
      : resolvePath(process.cwd(), configuredPath);
  }

  private buildOpenAiLogEntry(
    input: OpenAiLogContext,
  ): Record<string, unknown> {
    return {
      timestamp: new Date().toISOString(),
      source_file: input.sourceFile,
      model: input.model,
      raw_product_input: input.rawProductInput,
      openai_input: input.openAiInput,
      openai_response: input.openAiResponse ?? null,
      raw_output_text: input.rawOutputText ?? null,
      parsed_output: input.parsedOutput ?? null,
      error: input.errorMessage ?? null,
    };
  }

  private async appendOpenAiLog(entry: Record<string, unknown>): Promise<void> {
    try {
      const logPath = this.getOpenAiLogPath();
      await mkdir(dirname(logPath), { recursive: true });
      await appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (error) {
      this.logger.warn(
        `Failed to append OpenAI import log: ${getErrorMessage(error)}`,
      );
    }
  }

  private requireString(value: unknown, fieldName: string): string {
    const normalized = this.requireOptionalString(value);
    if (!normalized) {
      throw new BadRequestException(
        `${fieldName} is missing in the AI response.`,
      );
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
