// FocalImage — 고정 크기 컨테이너 안에서 hero 이미지를 cover 로 채우되, focal point(0..1)를
// 중앙에 두도록 크롭(IG 프로필식). 컨테이너 크기는 부모(슬라이드 레이아웃)가 결정하므로
// 종횡비 보정이 화면 reflow 를 일으키지 않는다 — 내부 <Image> 의 크롭 오프셋만 미세 조정.
//
// focal 없음 / 컨테이너 미측정 / Image.getSize 실패 → plain resizeMode="cover" center 로 폴백(현행 동작).
// CARDNEWS-HERO-CUSTOM-001.

import { useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageStyle,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface FocalImageProps {
  uri: string;
  // 0..1 (x=가로, y=세로). 생략/null = center(0.5,0.5) → plain cover.
  focal?: { x: number; y: number } | null | undefined;
  // 이미지 종횡비(w/h). 기본 2:3(gpt-image 1024×1536). getSize 로 실측 보정.
  aspectRatio?: number;
  // 컨테이너 스타일(부모가 크기 결정 — fullbleed=absoluteFill, band=고정 height).
  style?: StyleProp<ViewStyle>;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// 컨테이너(cw×ch) 안에서 imgAspect(=w/h) 이미지를 cover 스케일로 채우고 focal(0..1)을 컨테이너
// 중앙에 정렬하는 절대배치 box. scaledW/scaledH 비율은 항상 imgAspect 와 같아(박스=이미지 종횡비)
// resizeMode 기본 cover 가 박스 내부를 왜곡/크롭하지 않고, 크롭은 컨테이너 overflow:hidden 이 담당.
// offset = 컨테이너중앙 − focal·scaled, [cw−scaledW, 0] 로 clamp(항상 컨테이너를 덮음).
// 순수 함수로 분리 — 유일한 비자명 로직이라 단위 테스트로 봉인(CARDNEWS-HERO-CUSTOM-001).
export interface FocalBox {
  width: number;
  height: number;
  left: number;
  top: number;
}

export function computeFocalBox(
  cw: number,
  ch: number,
  imgAspect: number,
  focalX: number,
  focalY: number,
): FocalBox {
  const containerAspect = cw / ch;
  let scaledW: number;
  let scaledH: number;
  if (imgAspect > containerAspect) {
    // 이미지가 더 넓음 → 높이 맞추고 좌우 크롭
    scaledH = ch;
    scaledW = ch * imgAspect;
  } else {
    // 이미지가 더 높음(또는 동일) → 너비 맞추고 상하 크롭
    scaledW = cw;
    scaledH = cw / imgAspect;
  }
  const left = clamp(cw / 2 - clamp(focalX, 0, 1) * scaledW, cw - scaledW, 0);
  const top = clamp(ch / 2 - clamp(focalY, 0, 1) * scaledH, ch - scaledH, 0);
  return { width: scaledW, height: scaledH, left, top };
}

export function FocalImage({
  uri,
  focal,
  aspectRatio = 2 / 3,
  style,
}: FocalImageProps): React.JSX.Element {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [imgAspect, setImgAspect] = useState(aspectRatio);

  useEffect(() => {
    let cancelled = false;
    // 비동기 실측 — 성공 시 종횡비 보정(대다수 2:3 라 변화 거의 없음), 실패 시 기본값 유지(center 폴백).
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled && h > 0) setImgAspect(w / h);
      },
      () => {
        /* 실패 → 기본 종횡비 유지, focal 적용은 아래에서 center 폴백과 동일하게 안전 */
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [uri]);

  const onLayout = (e: LayoutChangeEvent): void => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  };

  const canFocal = box !== null && focal != null && box.w > 0 && box.h > 0;

  // ImageStyle(ViewStyle 아님) — RN Image 의 style prop 타입. 폴백 = 컨테이너 가득 채우는 absolute box
  // (+ resizeMode='cover' → center crop, 현행 동작). focal 적용 시 명시 크기 box 로 교체.
  let imgStyle: StyleProp<ImageStyle> = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
  let resize: 'cover' | undefined = 'cover';
  if (canFocal) {
    const b = computeFocalBox(box.w, box.h, imgAspect, focal.x, focal.y);
    imgStyle = { position: 'absolute', width: b.width, height: b.height, left: b.left, top: b.top };
    resize = undefined; // 명시 크기라 resizeMode 불필요(박스=이미지 종횡비라 원본 비율 보존)
  }

  return (
    <View style={[style, styles.clip]} onLayout={onLayout}>
      <Image
        source={{ uri }}
        style={imgStyle}
        {...(resize !== undefined ? { resizeMode: resize } : {})}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
