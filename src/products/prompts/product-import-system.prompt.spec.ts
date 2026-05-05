import { buildProductImportSystemPrompt } from './product-import-system.prompt';

describe('buildProductImportSystemPrompt', () => {
  it('includes strict brand and non-inference rules', () => {
    const prompt = buildProductImportSystemPrompt({
      brands: [{ name_en: 'Acer' }] as never,
      specifications: [
        {
          id: 1,
          name_en: 'Display Size',
          allow_ai_inference: false,
          values: [],
        },
      ] as never,
      attributes: [
        {
          id: 2,
          name_en: 'Color',
          allow_ai_inference: false,
          values: [],
        },
      ] as never,
    });

    expect(prompt).toContain(
      'NEVER substitute one manufacturer brand for another.',
    );
    expect(prompt).toContain(
      'DO NOT replace it with a different existing DATABASE BRAND.',
    );
    expect(prompt).toContain(
      'When allow_ai_inference is FALSE, you MUST NOT infer, guess, assume, borrow, map, or create a value unless the product data explicitly contains that specification or its value.',
    );
    expect(prompt).toContain(
      'For allow_ai_inference = FALSE, if the product data does not explicitly contain this specification, values MUST stay [] and you MUST NOT choose an existing DB value or create a new one.',
    );
    expect(prompt).toContain(
      'When allow_ai_inference is FALSE, you MUST NOT infer, guess, assume, borrow, map, or create a value unless the product data explicitly contains that attribute or its value.',
    );
    expect(prompt).toContain(
      'For allow_ai_inference = FALSE, if the product data does not explicitly contain this attribute, values MUST stay [] and you MUST NOT choose an existing DB value or create a new one.',
    );
    expect(prompt).toContain(
      'DO NOT return any brand that is different from the true manufacturer brand supported by the product data.',
    );
  });
});