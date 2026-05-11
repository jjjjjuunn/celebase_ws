import { render, screen } from '@testing-library/react-native';
import App from '../App';

describe('App (welcome screen)', () => {
  it('CelebBase 타이틀과 한국어 서브타이틀을 렌더한다', () => {
    render(<App />);
    expect(screen.getByText('CelebBase')).toBeTruthy();
    expect(screen.getByText('건강한 일상을 위한 웰니스 플랫폼')).toBeTruthy();
  });
});
