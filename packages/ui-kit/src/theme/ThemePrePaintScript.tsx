const PRE_PAINT_SCRIPT = `(function(){try{var k='celebbase:theme';var r=localStorage.getItem(k);var m=(r==='light'||r==='dark'||r==='system')?r:'system';var resolved=m==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;document.documentElement.dataset.theme=resolved;}catch(_){}})();`;

interface ThemePrePaintScriptProps {
  nonce?: string;
}

export function ThemePrePaintScript({ nonce }: ThemePrePaintScriptProps) {
  return (
    <script
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }}
      suppressHydrationWarning
    />
  );
}
