import Link from 'next/link';

export default function SliceIndex() {
  return (
    <section>
      <h1 style={{ fontFamily: 'var(--cb-font-family-display)' }}>Slice previews</h1>
      <p>In-app preview routes replace Storybook for this project. Each route renders a verifiable surface of the design system.</p>
      <ul>
        <li>
          <Link href="/slice/tokens">/slice/tokens</Link> — populated by IMPL-UI-001
        </li>
        <li>
          <Link href="/slice/primitives">/slice/primitives</Link> — populated by IMPL-UI-002
        </li>
      </ul>
    </section>
  );
}
