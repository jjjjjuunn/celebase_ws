import type { ReactNode } from 'react';
import styles from './landing.module.css';
import { Reveal } from './Reveal';
import { SpreadCell } from './SpreadCell';
import {
  DECODE_PIPELINE,
  FEATURED_DECODE,
  FLAGSHIP_FEATURES,
  MORE_DECODES,
} from './data';

// "Celebrity Decode" showcase — the real Instagram card news that fronts the
// product. The featured set is walked slide-by-slide so a visitor sees both the
// craft and the arc (hook → what they do → science → the catch → rescaled → CTA),
// then the editorial pipeline behind it, more published decodes, and what the
// app actually ships. Images are self-produced brand assets in /public/cardnews.
export function CardNewsShowcase(): ReactNode {
  return (
    <section id="decode" className={styles.section}>
      <div className={styles.container}>
        <Reveal>
          <div className={styles.sectionHead}>
            <div className={styles.sectionMeta}>
              <span className={styles.sectionIndex}>01</span>
              <p className={styles.eyebrow}>Celebrity Decode</p>
            </div>
            <h2 className={styles.sectionTitle}>
              Decoded, <em>rescaled to you.</em>
            </h2>
            <p className={styles.sectionIntro}>
              Every week we take a celebrity&rsquo;s publicly reported diet, weigh the science, and
              &ldquo;decode&rdquo; it — turning their plate into numbers your body can use. Here&rsquo;s
              one, slide by slide.
            </p>
          </div>
        </Reveal>

        {/* Featured set — the arc of a single Decode */}
        <Reveal>
          <p className={styles.blockLabel}>
            <span className={styles.blockLabelMark} aria-hidden="true" />
            A Decode, slide by slide — {FEATURED_DECODE.celebrity}
          </p>
        </Reveal>
        <ol className={styles.decodeStrip} aria-label={`The ${FEATURED_DECODE.celebrity} Decode, slide by slide`}>
          {FEATURED_DECODE.slides.map((slide, i) => (
            // Scroll-linked: converged at the centre, spreads out as the row
            // scrolls in, re-converges on the way back up.
            <SpreadCell
              key={slide.src}
              index={i}
              count={FEATURED_DECODE.slides.length}
              step={64}
              startScale={0.82}
              className={styles.decodeSlide}
            >
              <figure className={styles.decodeFigure}>
                <span className={styles.decodeShot}>
                  {/* Self-produced brand asset; plain img is intentional to keep
                      next.config / next/image out of scope. Sized by CSS aspect-ratio. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={styles.decodeImg}
                    src={slide.src}
                    alt={slide.alt}
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                <figcaption className={styles.decodeCap}>
                  <span className={styles.decodeStage}>{slide.stage}</span>
                  <span className={styles.decodeNote}>{slide.note}</span>
                </figcaption>
              </figure>
            </SpreadCell>
          ))}
        </ol>

        {/* How each one is built */}
        <Reveal>
          <p className={styles.blockLabel}>
            <span className={styles.blockLabelMark} aria-hidden="true" />
            How we make each one
          </p>
        </Reveal>
        <Reveal>
          <div className={styles.pipeline}>
            {DECODE_PIPELINE.map((step, i) => (
              <span key={step.label} className={styles.pipelineStep}>
                <span className={styles.pipelineNum} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {step.label}
                {i < DECODE_PIPELINE.length - 1 ? (
                  <span className={styles.pipelineArrow} aria-hidden="true">
                    →
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </Reveal>

        {/* More published decodes — variety */}
        <Reveal>
          <p className={styles.blockLabel}>
            <span className={styles.blockLabelMark} aria-hidden="true" />
            More in the feed
          </p>
        </Reveal>
        <ul className={styles.moreStrip} aria-label="More published Celebrity Decodes">
          {MORE_DECODES.map((set, i) => (
            <SpreadCell
              key={set.slug}
              index={i}
              count={MORE_DECODES.length}
              step={72}
              startScale={0.84}
              className={styles.moreCard}
              innerClassName={styles.moreInner}
            >
              <span className={styles.moreShot}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.moreImg}
                  src={set.cover}
                  alt={set.coverAlt}
                  loading="lazy"
                  decoding="async"
                />
              </span>
              <span className={styles.moreMeta}>
                <span className={styles.moreName}>{set.celebrity}</span>
                <span className={styles.moreHook}>{set.hook}</span>
              </span>
            </SpreadCell>
          ))}
        </ul>

        {/* What the app actually ships */}
        <Reveal>
          <div className={styles.flagshipBand}>
            <p className={styles.blockLabel}>
              <span className={styles.blockLabelMark} aria-hidden="true" />
              What you get
            </p>
            <ol className={styles.flagshipGrid}>
              {FLAGSHIP_FEATURES.map((f) => (
                <li key={f.index} className={styles.flagshipCard}>
                  <span className={styles.flagshipIndex} aria-hidden="true">
                    {f.index}
                  </span>
                  <h3 className={styles.flagshipName}>{f.name}</h3>
                  <p className={styles.flagshipBlurb}>{f.blurb}</p>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
