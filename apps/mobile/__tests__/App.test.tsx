// App 은 module-load 시점에 configureCognito() 를 호출하므로 aws-amplify 가
// jest transform 범위 밖 (.ts RN export) 인 점을 우회하려면 jest.mock 으로
// 모듈 자체를 차단해야 한다. env 셋업은 `jest.setup.js` 에서 처리.
jest.mock('aws-amplify', () => ({
  Amplify: { configure: jest.fn() },
}));

import { render, screen } from '@testing-library/react-native';
import App from '../App';

describe('App (welcome screen)', () => {
  it('CelebBase 타이틀과 한국어 서브타이틀을 렌더한다', () => {
    render(<App />);
    expect(screen.getByText('CelebBase')).toBeTruthy();
    expect(screen.getByText('건강한 일상을 위한 웰니스 플랫폼')).toBeTruthy();
  });
});
