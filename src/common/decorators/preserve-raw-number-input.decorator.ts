import { Transform } from 'class-transformer';

export function PreserveRawNumberInput() {
  return Transform(
    ({ obj, key, value }) => {
      const rawValue = obj?.[key];

      if (rawValue === '') {
        return undefined;
      }

      return rawValue ?? value;
    },
    { toClassOnly: true },
  );
}