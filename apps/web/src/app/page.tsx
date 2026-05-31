import type { Metadata } from 'next';
import { SmoothScroll } from '@/landing/SmoothScroll';
import { TopNav } from '@/landing/TopNav';
import { Hero } from '@/landing/Hero';
import { CardNewsShowcase } from '@/landing/CardNewsShowcase';
import { NewsSection } from '@/landing/NewsSection';
import { EngineSection } from '@/landing/EngineSection';
import { WorkedExample } from '@/landing/WorkedExample';
import { Faq } from '@/landing/Faq';
import { ClosingCta } from '@/landing/ClosingCta';
import { SiteFooter } from '@/landing/SiteFooter';
import styles from '@/landing/landing.module.css';

// Public landing for celebase.app. The web client is no longer the active product
// surface (mobile is) — this root page is a marketing front + the home for the
// legal pages (/terms, /privacy) the mobile app links to. `/` is NOT in the
// middleware PROTECTED_PREFIXES, so it renders for everyone.
//
// The landing's components live OUTSIDE the route tree, in `apps/web/src/landing/`
// (imported via the `@/landing/*` alias) — this file is the only piece that must
// stay in `app/` because Next.js maps it to the `/` route.

export const metadata: Metadata = {
  title: 'Celebase Wellness — celebrity wellness, recomputed for your body',
  description:
    'Celebase follows wellness trends first, then re-computes celebrity-inspired meal plans for your body — every claim sourced from USDA FoodData Central + NIH ODS. Coming to iOS and Android.',
};

export default function HomePage(): React.ReactElement {
  const year = new Date().getFullYear();
  return (
    <SmoothScroll>
      <div className={styles.page}>
        <TopNav />
        <main>
          <Hero />
          <CardNewsShowcase />
          <NewsSection />
          <EngineSection />
          <WorkedExample />
          <Faq />
          <ClosingCta />
        </main>
        <SiteFooter year={year} />
      </div>
    </SmoothScroll>
  );
}
