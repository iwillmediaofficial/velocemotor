import type { ProductImage } from './types';

/** Every uploaded image is stored in R2 as products/<id>-<width>.webp in these widths. */
export const IMAGE_WIDTHS = [480, 960, 1600] as const;

const BASE = (import.meta.env.PUBLIC_MEDIA_URL || '/media').replace(/\/$/, '');

export const imgUrl = (img: ProductImage, w: (typeof IMAGE_WIDTHS)[number] = 960) => `${BASE}/products/${img.id}-${w}.webp`;

export const srcset = (img: ProductImage) => IMAGE_WIDTHS.map((w) => `${imgUrl(img, w)} ${Math.min(w, img.w)}w`).join(', ');
