import { Media } from '../../media/entities/media.entity';
import { ProductMedia } from '../entities/product-media.entity';

export type ProductMediaView = Media & {
  is_primary: boolean;
  sort_order: number;
};

type ProductMediaContainer = {
  productMedia?: ProductMedia[] | null;
  media?: ProductMediaView[];
};

export function hydrateProductMedia<T extends ProductMediaContainer>(
  product: T | null | undefined,
  stripRelation = false,
): T | null | undefined {
  if (!product) {
    return product;
  }

  const media = (product.productMedia ?? [])
    .filter((link): link is ProductMedia & { media: Media } => Boolean(link?.media))
    .sort((left, right) => {
      if (left.is_primary !== right.is_primary) {
        return left.is_primary ? -1 : 1;
      }

      if (left.sort_order !== right.sort_order) {
        return left.sort_order - right.sort_order;
      }

      return left.media.id - right.media.id;
    })
    .map((link) => ({
      ...link.media,
      is_primary: link.is_primary,
      sort_order: link.sort_order,
    }));

  product.media = media;

  if (stripRelation) {
    delete (product as any).productMedia;
  }

  return product;
}

export function hydrateProductsMedia<T extends ProductMediaContainer>(
  products: T[],
  stripRelation = false,
): T[] {
  products.forEach((product) => {
    hydrateProductMedia(product, stripRelation);
  });

  return products;
}

export function getPrimaryMediaUrl(
  product: ProductMediaContainer | null | undefined,
): string | null {
  if (!product) {
    return null;
  }

  const media = product.media ?? hydrateProductMedia(product)?.media ?? [];
  return media[0]?.url ?? null;
}