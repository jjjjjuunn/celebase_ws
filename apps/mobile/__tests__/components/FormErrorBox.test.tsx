// FormErrorBox — null/빈 문자열 = 미렌더 계약 검증.
// SocialAuthButtons 가 탭 시 clear 신호로 onError('') 를 보내는데, '' 가 빈 박스로
// 떠버리던 회귀(빈 빨간 박스)를 고정한다.

import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { FormErrorBox } from '../../src/components/FormErrorBox';
import { ThemeProvider } from '../../src/ui';

function renderBox(ui: ReactElement): ReturnType<typeof render> {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('<FormErrorBox />', () => {
  it('null → 렌더 안 함', () => {
    const { toJSON } = renderBox(<FormErrorBox message={null} />);
    expect(toJSON()).toBeNull();
  });

  it('빈 문자열 → 렌더 안 함 (clear 신호)', () => {
    const { toJSON } = renderBox(<FormErrorBox message="" />);
    expect(toJSON()).toBeNull();
  });

  it('공백만 있는 문자열 → 렌더 안 함', () => {
    const { toJSON } = renderBox(<FormErrorBox message="   " />);
    expect(toJSON()).toBeNull();
  });

  it('실제 메시지 → alert 박스로 렌더', () => {
    renderBox(<FormErrorBox message="Incorrect email or password." />);
    expect(screen.getByText('Incorrect email or password.')).toBeTruthy();
  });
});
