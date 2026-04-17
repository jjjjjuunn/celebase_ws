const PRE_PAINT_SCRIPT = `(function(){try{var k='celebbase:theme';var r=localStorage.getItem(k);var m=(r==='light'||r==='dark'||r==='system')?r:'system';var resolved=m==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;document.documentElement.dataset.theme=resolved;}catch(_){}})();`;

export function ThemePrePaintScript() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }}
      suppressHydrationWarning
    />
  );
}
