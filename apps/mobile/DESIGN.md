# CelebBase Mobile — Design Language

> 단일 디자인 시스템. **모든 화면·컴포넌트는 `useTheme()` + `src/ui/` primitive로만 짓는다.**
> `resolveToken('light', …)` 직접 호출 / raw hex / inline magic number 금지 (아래 Don't 참조).
> 토큰 원천: `packages/design-tokens/tokens.css` → `theme.ts`가 타입화된 `Theme`로 노출.

---

## 1. Tokens — `const theme = useTheme()`

| 그룹 | 접근 | 값 |
|------|------|-----|
| **색** | `theme.color.*` | `bg` `surface` `text` `textMuted` `textSubtle` `border` `brand` `brandBg` `brandSubtle` `onBrand` `error` `skeletonBase` `skeletonShimmer` |
| **accent** | `theme.accents[i]` | monogram/카테고리용 결정적 6색 팔레트 (`monogramIndex(name, theme.accents.length)`) |
| **간격** | `theme.space(n)` | 4px 베이스. `space(2)=8` `space(4)=16` `space(6)=24` … `space(0..14)` |
| **라운드** | `theme.radius.*` | `sm`8 `md`12 `lg`16 `xl`24 `xxl`32 `pill`9999 |
| **타입 크기** | `theme.type.*` | `display`34 `h1`32 `h2`24 `h3`20 `h4`18 `bodyLg`18 `body`16 `bodySm`14 `caption`12 |
| **폰트** | `theme.font.*` | `display`=Fraunces(serif) `body`=Plus Jakarta Sans |
| **두께** | `theme.weight.*` | `regular`400 `medium`500 `semibold`600 `bold`700 |
| **모션** | `theme.motion.*` | `duration.{fast120,base180,slow330}`(ms) · `easing.{standard,emphasized}`=`Easing.bezier(...e)` 컨트롤포인트 |

색·간격·라운드·타입은 **숫자를 직접 쓰지 말고 토큰을** 쓴다. 다크 테마는 같은 토큰명이 자동 매핑된다.

---

## 2. Primitives — `import { … } from '../ui'`

| Primitive | 핵심 props | 용도 |
|-----------|-----------|------|
| `<Text>` | `variant`(display·h1–h4·body·bodyLg·bodySm·caption·label) `tone`(default·muted·subtle·brand·onBrand·error) `center` | 모든 텍스트. 직접 `<RNText>` 금지 |
| `<Button>` | `label` `onPress` `variant`(primary·secondary·ghost) `size`(md·lg) `loading` `disabled` `fullWidth` `testID` | 모든 버튼. ad-hoc `primaryButton` 금지 |
| `<Card>` | `variant`(surface·subtle·outlined) `padded` `onPress` `style` | 카드/surface 컨테이너 (그림자 토큰 내장) |
| `<Avatar>` | `uri` `name`(monogram fallback) `size` | 셀럽/유저 아바타 |
| `<Badge>` | `label` `tone`(brand·subtle·neutral) | tier/카테고리/상태 pill |
| `<Skeleton>` | `width` `height` `radius` | 로딩 placeholder (빈 화면 금지 — content.md) |
| `<EmptyState>` | `glyph` `title` `body` `ctaLabel` `onPressCta` | 빈 surface |
| `<Screen>` | `title` `scroll` `edges` `contentStyle` | SafeArea + large-title 래퍼 |

`monogramInitials(name)` / `monogramIndex(name, len)` — 이름→이니셜/결정적 accent 인덱스.

---

## 3. 새 화면 만드는 법 (복붙 템플릿)

```tsx
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Screen, Text, useTheme, type Theme } from '../ui';

export function FooScreen(): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Screen title="Foo" scroll>
      <Card style={styles.section}>
        <Text variant="h3">제목</Text>
        <Text variant="bodySm" tone="muted">설명</Text>
        <Button label="계속" onPress={() => {}} />
      </Card>
    </Screen>
  );
}

// 스타일은 theme를 받아 빌드 — 모든 값은 theme.* 토큰.
function makeStyles(theme: Theme) {
  return StyleSheet.create({
    section: { gap: theme.space(3), marginHorizontal: theme.space(4) },
  });
}
```

`ProfileScreen.tsx` / `CelebritiesScreen.tsx`가 실사용 레퍼런스다.

---

## 4. Do / Don't

| ✅ Do | ❌ Don't |
|-------|----------|
| `const theme = useTheme()` | `resolveToken('light', '--cb-…')` 직접 호출 (light 하드와이어 → 다크 차단) |
| `theme.color.brand` | `'#8B6D2F'` raw hex (FE 토큰 규칙 위반, gate fail) |
| `theme.space(4)` `theme.radius.lg` | `marginTop: 16` `borderRadius: 12` magic number |
| `<Text variant="h1">` | `<RNText style={{ fontSize: 32, fontWeight: '800' }}>` |
| `<Button variant="primary">` | 화면마다 `primaryButton` StyleSheet 재정의 |
| `makeStyles(theme)` + `useMemo` | 모듈 스코프 `StyleSheet.create` (테마 전환 불가) |
| `shadowColor: theme.color.text` | `shadowColor: '#000'` |

신규 색/간격이 필요하면 **먼저** `tokens.css` 확장 → `theme.ts` 노출 → 컴포넌트에서 토큰 참조.
