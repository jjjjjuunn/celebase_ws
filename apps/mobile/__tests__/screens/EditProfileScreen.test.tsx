// EditProfileScreen — nickname + photo edit flow (FEAT-PROFILE-EDIT).

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import * as ImagePicker from 'expo-image-picker';

import { EditProfileScreen } from '../../src/screens/EditProfileScreen';
import * as usersService from '../../src/services/users';
import { ThemeProvider } from '../../src/ui';

const mockPickerPermission = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;

function renderScreen(ui: ReactElement): ReturnType<typeof render> {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function mockCurrentUser(overrides: Partial<{ display_name: string; avatar_url: string | null }> = {}): void {
  jest.spyOn(usersService, 'getCurrentUser').mockResolvedValue({
    user: { display_name: 'Kim', email: 'kim@example.com', avatar_url: null, ...overrides },
  } as unknown as Awaited<ReturnType<typeof usersService.getCurrentUser>>);
}

async function waitForPrefill(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByDisplayValue('Kim')).toBeTruthy();
  });
}

describe('<EditProfileScreen />', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['EXPO_PUBLIC_BFF_BASE_URL'] = 'http://localhost:3000';
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('prefills the display name from the current user', async () => {
    mockCurrentUser({ display_name: 'Kim' });
    renderScreen(<EditProfileScreen onDone={jest.fn()} />);
    await waitForPrefill();
  });

  it('saves a changed nickname via updateMe then calls onDone', async () => {
    mockCurrentUser({ display_name: 'Kim' });
    const updateMock = jest
      .spyOn(usersService, 'updateMe')
      .mockResolvedValue({ user: {} } as unknown as Awaited<ReturnType<typeof usersService.updateMe>>);
    const onDone = jest.fn();

    renderScreen(<EditProfileScreen onDone={onDone} />);
    await waitForPrefill();

    fireEvent.changeText(screen.getByTestId('edit-profile-name-input'), 'Chulsu Kim');
    fireEvent.press(screen.getByTestId('edit-profile-save'));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({ display_name: 'Chulsu Kim' });
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call updateMe when nothing changed', async () => {
    mockCurrentUser({ display_name: 'Kim' });
    const updateMock = jest.spyOn(usersService, 'updateMe');
    const onDone = jest.fn();

    renderScreen(<EditProfileScreen onDone={onDone} />);
    await waitForPrefill();

    fireEvent.press(screen.getByTestId('edit-profile-save'));

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('uploads a picked photo then saves avatar_url', async () => {
    mockCurrentUser({ display_name: 'Kim' });
    mockPickerPermission.mockResolvedValue({ granted: true });
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/pic.jpg', mimeType: 'image/jpeg', fileSize: 1024 }],
    });
    const presignMock = jest.spyOn(usersService, 'requestAvatarUploadUrl').mockResolvedValue({
      upload_url: 'https://s3.example.com/put?sig=1',
      public_url: 'https://avatars.example.com/avatars/u/pic.jpg',
      key: 'avatars/u/pic.jpg',
      expires_in: 300,
      max_bytes: 5_000_000,
    });
    const uploadMock = jest.spyOn(usersService, 'uploadAvatarFile').mockResolvedValue(undefined);
    const updateMock = jest
      .spyOn(usersService, 'updateMe')
      .mockResolvedValue({ user: {} } as unknown as Awaited<ReturnType<typeof usersService.updateMe>>);
    const onDone = jest.fn();

    renderScreen(<EditProfileScreen onDone={onDone} />);
    await waitForPrefill();

    fireEvent.press(screen.getByTestId('edit-profile-pick-photo'));
    await waitFor(() => {
      expect(mockLaunchLibrary).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByTestId('edit-profile-save'));

    await waitFor(() => {
      expect(presignMock).toHaveBeenCalledWith('image/jpeg');
      expect(uploadMock).toHaveBeenCalledWith(
        'https://s3.example.com/put?sig=1',
        'file:///tmp/pic.jpg',
        'image/jpeg',
      );
      expect(updateMock).toHaveBeenCalledWith({
        avatar_url: 'https://avatars.example.com/avatars/u/pic.jpg',
      });
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it('alerts and skips the picker when photo permission is denied', async () => {
    mockCurrentUser({ display_name: 'Kim' });
    mockPickerPermission.mockResolvedValue({ granted: false });

    renderScreen(<EditProfileScreen onDone={jest.fn()} />);
    await waitForPrefill();

    fireEvent.press(screen.getByTestId('edit-profile-pick-photo'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Photo access needed', expect.any(String));
    });
    expect(mockLaunchLibrary).not.toHaveBeenCalled();
  });
});
