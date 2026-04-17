import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ padding: '48px 24px', maxWidth: 720, margin: '0 auto' }}>
      <h1>CelebBase Wellness</h1>
      <p>
        Frontend scaffold landing page. Design system previews live under{' '}
        <Link href="/slice">/slice</Link>.
      </p>
      <ul>
        <li>
          <Link href="/slice/tokens">/slice/tokens</Link> — palette, typography, spacing, radius, shadow
        </li>
        <li>
          <Link href="/slice/components">/slice/components</Link> — component variant gallery
        </li>
      </ul>
    </main>
  );
}
