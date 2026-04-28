"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const core_1 = require("@nestjs/core");
const typeorm_1 = require("@nestjs/typeorm");
const app_module_1 = require("./src/app.module");
const brand_entity_1 = require("./src/brands/entities/brand.entity");
const product_entity_1 = require("./src/products/entities/product.entity");
const product_import_service_1 = require("./src/products/product-import.service");
function normalizeLookupText(value) {
    return Array.from(value.toLowerCase())
        .filter((character) => /[\p{L}\p{N}]/u.test(character))
        .join('');
}
function findBrandByName(brands, brandName) {
    const normalizedBrandName = normalizeLookupText(brandName);
    for (const brand of brands) {
        const candidates = [brand.name_en, brand.name_ar]
            .map((value) => value?.trim())
            .filter((value) => !!value)
            .map((value) => normalizeLookupText(value));
        if (candidates.includes(normalizedBrandName)) {
            return brand;
        }
    }
    return null;
}
function readLatestMsiEntry(logPath) {
    const lines = (0, fs_1.readFileSync)(logPath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const parsed = JSON.parse(lines[index]);
        const rawProductInput = parsed.raw_product_input;
        const title = rawProductInput?.title;
        if (typeof title === 'string' &&
            title.includes('MSI PRO MP275W E2')) {
            return parsed;
        }
    }
    throw new Error('Could not find an MSI monitor entry in import_product_openai.jsonl.');
}
function readLatestEntryBySourceFile(logPath, sourceFile) {
    const lines = (0, fs_1.readFileSync)(logPath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const parsed = JSON.parse(lines[index]);
        if (parsed.source_file === sourceFile) {
            return parsed;
        }
    }
    throw new Error(`Could not find a log entry for source_file=${sourceFile}.`);
}
function tryParseJson(value) {
    if (typeof value !== 'string') {
        return null;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
async function main() {
    const logPath = (0, path_1.resolve)(process.cwd(), 'logs', 'import_product_openai.jsonl');
    const msiEntry = readLatestMsiEntry(logPath);
    const rawProductInput = msiEntry.raw_product_input;
    if (!rawProductInput) {
        throw new Error('MSI log entry did not include raw_product_input.');
    }
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, {
        logger: false,
    });
    try {
        const importService = app.get(product_import_service_1.ProductImportService);
        const brandRepository = app.get((0, typeorm_1.getRepositoryToken)(brand_entity_1.Brand));
        const productRepository = app.get((0, typeorm_1.getRepositoryToken)(product_entity_1.Product));
        const getActiveBrands = async () => brandRepository.find({
            where: { status: brand_entity_1.BrandStatus.ACTIVE },
            order: { name_en: 'ASC' },
        });
        const beforeBrands = await getActiveBrands();
        const beforeMsiBrand = findBrandByName(beforeBrands, 'MSI');
        const requestBody = {
            ...rawProductInput,
            category_id: 9,
            vendor_id: 2,
            record: `msi-brand-verification-${Date.now()}`,
            source_file: 'msi-brand-verification',
        };
        const importResult = await importService.importFromRequest(requestBody);
        const createdProduct = importResult?.product ?? null;
        const persistedProduct = createdProduct?.id
            ? await productRepository.findOne({ where: { id: createdProduct.id } })
            : null;
        const afterBrands = await getActiveBrands();
        const afterMsiBrand = findBrandByName(afterBrands, 'MSI');
        const serviceInternals = importService;
        const payloadFallbackResult = await serviceInternals.resolveOrCreateBrand(afterBrands, requestBody, null);
        const aiPrimaryResult = await serviceInternals.resolveOrCreateBrand(afterBrands, {
            ...requestBody,
            brand: 'MSI',
        }, 'Samsung');
        const verificationEntry = readLatestEntryBySourceFile(logPath, 'msi-brand-verification');
        const parsedOutput = verificationEntry.parsed_output;
        const openAiInput = Array.isArray(verificationEntry.openai_input)
            ? verificationEntry.openai_input
            : [];
        const userPrompt = openAiInput.find((entry) => !!entry &&
            typeof entry === 'object' &&
            !Array.isArray(entry) &&
            entry.role === 'user');
        const userPayload = userPrompt?.role === 'user' ? tryParseJson(userPrompt.content) : null;
        console.log(JSON.stringify({
            before_msi_brand_id: beforeMsiBrand?.id ?? null,
            after_msi_brand_id: afterMsiBrand?.id ?? null,
            imported_product_id: createdProduct?.id ?? null,
            imported_product_brand_id: persistedProduct?.brand_id ?? null,
            brand_outcome: beforeMsiBrand
                ? 'resolved_existing'
                : afterMsiBrand
                    ? 'created_new'
                    : 'missing_after_import',
            openai_brand_name: parsedOutput?.brand_name ?? null,
            openai_user_payload_keys: userPayload
                ? Object.keys(userPayload).sort()
                : [],
            payload_contains_pricing: !!userPayload &&
                ['new_price', 'old_price', 'price', 'sale_price'].some((key) => key in userPayload),
            payload_contains_media: !!userPayload &&
                ['image', 'images', 'media'].every((key) => key in userPayload),
            payload_contains_stock: !!userPayload &&
                ['quantity', 'stock'].some((key) => key in userPayload),
            payload_contains_reference_link: !!userPayload && 'reference_link' in userPayload,
            payload_contains_raw_data: !!userPayload && 'raw_data' in userPayload,
            payload_brand_when_ai_null: payloadFallbackResult,
            payload_brand_when_ai_present: aiPrimaryResult,
        }, null, 2));
    }
    finally {
        await app.close();
    }
}
void main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=tmp-verify-product-import.js.map