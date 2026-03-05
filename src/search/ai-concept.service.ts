import { Injectable, Logger } from '@nestjs/common';

export interface ProductConceptInput {
  name_en: string;
  name_ar: string;
  category_names_en: string[];
  category_names_ar: string[];
  brand_en?: string;
  brand_ar?: string;
  vendor_en?: string;
  vendor_ar?: string;
  short_description_en?: string;
  short_description_ar?: string;
  long_description_en?: string;
  long_description_ar?: string;
}

export interface GeneratedConcept {
  concept_key_en: string;
  concept_key_ar?: string;
  terms_en: string[];
  terms_ar: string[];
}

/**
 * Generates search synonym concepts using OpenAI or Gemini.
 *
 * Provider selection (env vars):
 *   OPENAI_API_KEY   → uses GPT-4o-mini
 *   GEMINI_API_KEY   → uses Gemini 2.0 Flash
 *
 * No extra npm packages required — uses native fetch.
 */
@Injectable()
export class AiConceptService {
  private readonly logger = new Logger(AiConceptService.name);

  private get openaiKey(): string | undefined {
    return process.env.OPENAI_API_KEY;
  }

  private get geminiKey(): string | undefined {
    return process.env.GEMINI_API_KEY;
  }

  /**
   * Generate synonym concepts for a product.
   * Returns [] if no AI key is configured or on any error.
   */
  async generateConcepts(
    input: ProductConceptInput,
  ): Promise<GeneratedConcept[]> {
    if (!this.openaiKey && !this.geminiKey) {
      this.logger.warn(
        'No AI API key configured (OPENAI_API_KEY or GEMINI_API_KEY). Skipping concept generation.',
      );
      return [];
    }

    try {
      const prompt = this.buildPrompt(input);
      const raw = this.openaiKey
        ? await this.callOpenAI(prompt)
        : await this.callGemini(prompt);

      return this.parseResponse(raw);
    } catch (err: any) {
      this.logger.error(
        `AI concept generation failed: ${err?.message}`,
        err?.stack,
      );
      return [];
    }
  }

  // ── Prompt ──────────────────────────────────────────────────────────────────

  private buildPrompt(input: ProductConceptInput): string {

    return `You are a search synonym expert for an Arabic/English e-commerce platform targeting Jordanian customers.

Given this product:
- Name (EN): ${input.name_en}
- Name (AR): ${input.name_ar}
- Category (EN): ${input.category_names_en.join(', ')}
- Category (AR): ${input.category_names_ar.join(', ')}
- Brand (EN): ${input.brand_en ?? 'N/A'}
- Brand (AR): ${input.brand_ar ?? 'N/A'}
- Vendor (EN): ${input.vendor_en ?? 'N/A'}
- Vendor (AR): ${input.vendor_ar ?? 'N/A'}
- Short Description (EN): ${input.short_description_en ?? 'N/A'}
- Short Description (AR): ${input.short_description_ar ?? 'N/A'}
- Long Description (EN): ${input.long_description_en ?? 'N/A'}
- Long Description (AR): ${input.long_description_ar ?? 'N/A'}

Generate 20 - 30 synonym CONCEPTS for this product type.

Rules:
- Each concept represents a GENERIC PRODUCT TYPE (not brand, model, vendor, or marketing word)
- concept_key_en: lowercase English slug with underscores (one or two words), e.g. "smartphone", "power_bank"
- concept_key_ar: the same concept as a short Arabic label, e.g. "هاتف ذكي"
- terms_en: Include EVERY English word or phrase a customer might search — both SINGLE WORDS (e.g. "mobile", "phone") and MULTI-WORD PHRASES (e.g. "mobile phone", "cell phone", "smartphone"). Be exhaustive and comprehensive. There is NO limit on the number of terms — include as many as relevant (10, 20, 30, 50+ terms is perfectly fine if they all apply).
- terms_ar: Include EVERY Arabic word or phrase a Jordanian customer might search — cover BOTH Modern Standard Arabic (الفصحى) AND Jordanian colloquial Arabic (العامية الأردنية). Include single words AND multi-word phrases. There is NO limit — include as many as relevant. Examples of the variety expected: هاتف، موبايل، خليوي، خلوي، جوال، تلفون، تليفون، تلفان، سمارت فون، هاتف ذكي، جهاز محمول، جوالات، خلويات.
- Do NOT include brand names, vendor names, model numbers, or spec values
- Return ONLY valid JSON, no markdown, no explanation

Example of CORRECT exhaustive output for a smartphone:
[
  {
    "concept_key_en": "smartphone",
    "concept_key_ar": "هاتف ذكي",
    "terms_en": ["phone", "phones", "mobile", "mobiles", "mobile phone", "cell phone", "cellular phone", "cellphone", "smartphone", "smart phone", "handphone", "handheld", "handheld device", "android phone", "touchscreen phone"],
    "terms_ar": ["هاتف", "هواتف", "موبايل", "خليوي", "خلوي", "جوال", "جوالات", "تلفون", "تليفون", "تلفان", "سمارت فون", "هاتف ذكي", "هاتف محمول", "جهاز محمول", "جهاز ذكي", "خلويات", "شاشة لمس"]
  }
]`;  
  }

  // ── OpenAI ──────────────────────────────────────────────────────────────────

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content ?? '[]';
  }

  // ── Gemini ──────────────────────────────────────────────────────────────────

  private async callGemini(prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
      }>;
    };
    return data.candidates[0]?.content?.parts[0]?.text ?? '[]';
  }

  // ── Parser ──────────────────────────────────────────────────────────────────

  private parseResponse(raw: string): GeneratedConcept[] {
    // Strip markdown code fences if model returns them
    const cleaned = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.warn(`AI returned invalid JSON: ${cleaned.slice(0, 200)}`);
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    return (parsed as any[])
      .filter(
        (item) =>
          typeof item === 'object' &&
          typeof item.concept_key_en === 'string' &&
          Array.isArray(item.terms_en) &&
          Array.isArray(item.terms_ar),
      )
      .map((item) => ({
        concept_key_en: String(item.concept_key_en)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_'),
        concept_key_ar:
          typeof item.concept_key_ar === 'string'
            ? item.concept_key_ar.trim()
            : undefined,
        terms_en: this.normalizeTerms(item.terms_en as string[]),
        terms_ar: this.normalizeTerms(item.terms_ar as string[]),
      }))
      .filter((c) => c.terms_en.length >= 2 && c.terms_ar.length >= 2);
  }

  private normalizeTerms(terms: string[]): string[] {
    return [
      ...new Set(
        terms
          .filter((t) => typeof t === 'string')
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length > 1 && !/^\d+$/.test(t)),
      ),
    ];
  }

  /**
   * Generate terms for a new tag name (concept_key_en = tag name).
   * Used when admin creates a brand-new tag that has no concept yet.
   * Returns { terms_en, terms_ar } or null if AI unavailable / error.
   */
  async generateTermsForTagName(
    tagName: string,
  ): Promise<{ terms_en: string[]; terms_ar: string[] } | null> {
    if (!this.openaiKey && !this.geminiKey) return null;

    const prompt = `You are a search synonym expert for an Arabic/English e-commerce platform targeting Jordanian customers.

Generate ALL search synonyms for this product tag/category: "${tagName}"

Rules:
- terms_en: Include EVERY English word or phrase a customer might search — both SINGLE WORDS and MULTI-WORD PHRASES. Be exhaustive. There is NO limit — include as many as relevant (10, 20, 30, 50+ terms is perfectly fine).
- terms_ar: Include EVERY Arabic word or phrase a Jordanian customer might search — cover BOTH Modern Standard Arabic (الفصحى) AND Jordanian colloquial Arabic (العامية الأردنية). Include single words AND multi-word phrases. There is NO limit.
- Do NOT include brand names, model numbers, or spec values
- Return ONLY valid JSON, no markdown, no explanation

Return format:
{ "terms_en": ["..."], "terms_ar": ["..."] }`;  

    try {
      const raw = this.openaiKey
        ? await this.callOpenAI(prompt)
        : await this.callGemini(prompt);

      const cleaned = raw
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      const parsed = JSON.parse(cleaned) as {
        terms_en: string[];
        terms_ar: string[];
      };

      if (!Array.isArray(parsed.terms_en) || !Array.isArray(parsed.terms_ar)) {
        return null;
      }

      return {
        terms_en: this.normalizeTerms(parsed.terms_en),
        terms_ar: this.normalizeTerms(parsed.terms_ar),
      };
    } catch {
      return null;
    }
  }
}

