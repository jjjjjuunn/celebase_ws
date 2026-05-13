// SettingsScreen integration — Apple Guideline 5.1.1(v) UI 흐름 검증.
// signOut / delete account / manage subscription / legal links 가 모두 trigger 되는지.

jest.mock('aws-amplify/auth', () => ({
  signIn: jest.fn(),
  signOut: jest.fn().mockResolvedValue(undefined),
  signUp: jest.fn(),
  confirmSignUp: jest.fn(),
  fetchAuthSession: jest.fn().mockResolvedValue({}),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { Alert, Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SettingsScreen } from '../../src/screens/SettingsScreen';
import * as authService from '../../src/services/auth';
import * as authEvents from '../../src/lib/auth-events';
import * as tierHook from '../../src/lib/use-current-tier';

describe('<SettingsScreen />', () => {
  let alertSpy: jest.SpyInstance;
  let linkingSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    process.env['EXPO_PUBLIC_USER_SERVICE_URL'] = 'http://localhost:3001';
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    linkingSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    jest.spyOn(tierHook, 'useCurrentTier').mockReturnValue({
      tier: 'free',
      loading: false,
      refresh: jest.fn(),
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
    linkingSpy.mockRestore();
  });

  it('필수 UI 섹션 + Apple 5.1.1(v) 항목 모두 노출', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Subscription')).toBeTruthy();
    expect(screen.getByText('Legal')).toBeTruthy();
    expect(screen.getByTestId('settings-delete-account')).toBeTruthy();
    expect(screen.getByTestId('settings-signout')).toBeTruthy();
    expect(screen.getByTestId('settings-terms')).toBeTruthy();
    expect(screen.getByTestId('settings-privacy')).toBeTruthy();
    expect(screen.getByTestId('settings-support')).toBeTruthy();
  });

  it('Sign out 탭 → 확인 prompt → handleSignOut 실행 → signOut + signalLogout 호출', async () => {
    const signOutMock = jest.spyOn(authService, 'signOut').mockResolvedValue(undefined);
    const signalLogoutMock = jest.spyOn(authEvents, 'signalLogout').mockImplementation(() => undefined);

    // Alert.alert 의 destructive 버튼 onPress 를 자동 호출하도록 mock 재설정.
    alertSpy.mockImplementation((_title, _msg, buttons) => {
      const list = buttons as { text: string; onPress?: () => void }[] | undefined;
      const signOutBtn = list?.find((b) => b.text === 'Sign out');
      signOutBtn?.onPress?.();
    });

    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('settings-signout'));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledTimes(1);
      expect(signalLogoutMock).toHaveBeenCalledWith('expired_or_missing');
    });
  });

  it('Delete account 탭 → 첫 confirm prompt 발사', () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('settings-delete-account'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete account',
      expect.stringContaining('permanently'),
      expect.any(Array),
    );
  });

  it('Terms / Privacy / Support 탭 → Linking.openURL 호출', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-terms'));
    expect(linkingSpy).toHaveBeenCalledWith('https://celebbase.com/terms');

    fireEvent.press(screen.getByTestId('settings-privacy'));
    expect(linkingSpy).toHaveBeenCalledWith('https://celebbase.com/privacy');

    fireEvent.press(screen.getByTestId('settings-support'));
    expect(linkingSpy).toHaveBeenCalledWith('mailto:support@celebbase.com');
  });

  it('premium tier → Manage subscription 노출 + 탭 시 Apple deep link 호출', () => {
    jest.spyOn(tierHook, 'useCurrentTier').mockReturnValue({
      tier: 'premium',
      loading: false,
      refresh: jest.fn(),
    });
    render(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('settings-manage-subscription'));
    expect(linkingSpy).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions');
  });

  it('free tier → Manage subscription 미노출', () => {
    render(<SettingsScreen />);
    expect(screen.queryByTestId('settings-manage-subscription')).toBeNull();
  });
});
