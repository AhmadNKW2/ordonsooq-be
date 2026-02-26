import { Injectable, Logger } from '@nestjs/common';

export interface ProductConceptInput {
  name_en: string;
  name_ar: string;
  category_names_en: string[];
  category_names_ar: string[];
  brand_en?: string;
  brand_ar?: string;
}

export interface GeneratedConcept {
  concept_key: string;
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
    return `You are a search synonym expert for an Arabic/English e-commerce platform.

Given this product:
- Name (EN): ${input.name_en}
- Name (AR): ${input.name_ar}
- Category (EN): ${input.category_names_en.join(', ')}
- Category (AR): ${input.category_names_ar.join(', ')}
- Brand (EN): ${input.brand_en ?? 'N/A'}
- Brand (AR): ${input.brand_ar ?? 'N/A'}

Generate 1–3 synonym CONCEPTS for this product type.

Rules:
- Each concept represents a GENERIC PRODUCT TYPE (not brand, model, or marketing word)
- concept_key: lowercase English with underscores, e.g. "power_bank", "wireless_earbuds"
- terms_en: 3–8 generic English synonyms for that type
- terms_ar: 3–8 genuine Arabic synonyms for that type
- Do NOT include brand names, model numbers, or spec values
- Return ONLY valid JSON, no markdown, no explanation

Return format:
[
  {
    "concept_key": "power_bank",
    "terms_en": ["power bank", "portable charger", "battery pack", "external battery"],
    "terms_ar": ["باور بانك", "شاحن متنقل", "بطارية خارجية", "شاحن محمول"]
  }
]`;
  }

  // ── OpenAI ──────────────────────────────────────────────────────────────────

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
          typeof item.concept_key === 'string' &&
          Array.isArray(item.terms_en) &&
          Array.isArray(item.terms_ar),
      )
      .map((item) => ({
        concept_key: String(item.concept_key)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_'),
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
    ].slice(0, 12);
  }

  /**
   * Generate terms for a new tag name (concept_key = tag name).
   * Used when admin creates a brand-new tag that has no concept yet.
   * Returns { terms_en, terms_ar } or null if AI unavailable / error.
   */
  async generateTermsForTagName(
    tagName: string,
  ): Promise<{ terms_en: string[]; terms_ar: string[] } | null> {
    if (!this.openaiKey && !this.geminiKey) return null;

    const prompt = `You are a search synonym expert for an Arabic/English e-commerce platform.

Generate synonyms for this product tag/category: "${tagName}"

Rules:
- terms_en: 3–8 generic English synonyms for this type
- terms_ar: 3–8 genuine Arabic synonyms for this type
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

