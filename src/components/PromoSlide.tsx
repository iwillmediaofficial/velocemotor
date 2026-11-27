// One slide of the home page "Offers & New Launches" slider.
// Rendered to static HTML by Astro (no JS shipped for it) and reused live in the admin preview.
import type { Promo, PromoKind } from '../lib/types';
import { imgUrl, srcset } from '../lib/media';

export const PROMO_KINDS: Record<PromoKind, string> = { launch: 'New Launch', offer: 'Offer', limited: 'Limited Time' };

type SlideData = Pick<Promo, 'kind' | 'title' | 'subtitle' | 'highlight' | 'cta_label' | 'cta_url' | 'image' | 'image_mobile' | 'image_has_text'>;

const isExternal = (url: string) => /^https:\/\//i.test(url);
const SIZES = '(max-width: 1240px) 100vw, 1200px';

export default function PromoSlide({ p, eager = false }: { p: SlideData; eager?: boolean }) {
  const ext = isExternal(p.cta_url) ? { target: '_blank', rel: 'noopener' } : {};
  const img = p.image && (
    <picture>
      {p.image_mobile && <source media="(max-width: 700px)" type="image/webp" srcset={srcset(p.image_mobile)} sizes="100vw" />}
      <img
        src={imgUrl(p.image, 960)} srcset={srcset(p.image)} sizes={SIZES} width={p.image.w} height={p.image.h}
        alt={p.image_has_text ? p.image.alt || p.title : ''} loading={eager ? 'eager' : 'lazy'} decoding="async"
      />
    </picture>
  );

  // A finished banner (text is part of the image): the whole slide is one link.
  if (p.image_has_text && p.image) {
    // Without a separate mobile image the banner keeps its wide shape on phones, so no text is cropped.
    return <a class={`promo promo-banner${p.image_mobile ? '' : ' wide-only'}`} href={p.cta_url} {...ext}>{img}</a>;
  }

  return (
    <div class={`promo${p.image ? '' : ' promo-plain'}`}>
      {img}
      <div class="promo-body">
        <span class={`promo-badge k-${p.kind}`}>{PROMO_KINDS[p.kind]}</span>
        <h3>{p.title}</h3>
        {p.subtitle && <p>{p.subtitle}</p>}
        {p.highlight && <div class="promo-hl">{p.highlight}</div>}
        <a class="btn btn-primary" href={p.cta_url} {...ext}>{p.cta_label}</a>
      </div>
    </div>
  );
}
