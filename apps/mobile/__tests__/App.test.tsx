import { render, screen } from '@testing-library/react-native';
import App from '../App';

describe('App', () => {
  it('placeholder Expo 시작 안내 문구를 렌더한다', () => {
    render(<App />);
    expect(
      screen.getByText('Open up App.tsx to start working on your app!'),
    ).toBeTruthy();
  });
});
