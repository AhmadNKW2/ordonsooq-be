export function sanitizeValueName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeValueNameForUniqueness(value: string): string {
  return sanitizeValueName(value).toLocaleLowerCase();
}

export function buildNormalizedValueSql(columnReference: string): string {
  return `regexp_replace(lower(btrim(${columnReference})), '\\s+', ' ', 'g')`;
}