// Edit profile (FEAT-PROFILE-EDIT) — change nickname (display_name) and photo.
//
// Photo flow: pick from library (expo-image-picker) → request a presigned S3
// PUT URL (BFF) → upload bytes directly to S3 → PATCH /users/me with the public
// URL. Nickname is a plain PATCH. Save sends only the fields that changed.

import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import type { schemas } from '@celebbase/shared-types';

import { getCurrentUser, requestAvatarUploadUrl, updateMe, uploadAvatarFile } from '../services/users';
import { Avatar, Button, Text, useTheme, type Theme } from '../ui';

const AVATAR_SIZE = 104;
const DISPLAY_NAME_MAX = 100;

interface EditProfileScreenProps {
  /** Called after a successful save (and on cancel). Navigator injects goBack. */
  onDone: () => void;
}

function resolveContentType(mimeType: string | undefined): schemas.AvatarContentType {
  if (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp') {
    return mimeType;
  }
  // iOS HEIC and anything else → declare JPEG. A faithful transcode (e.g.
  // expo-image-manipulator) is a follow-up; the allowlist is enforced server-side.
  return 'image/jpeg';
}

export function EditProfileScreen({ onDone }: EditProfileScreenProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [initialName, setInitialName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // Locally-picked image not yet uploaded. Drives the preview + upload on save.
  const [pendingImage, setPendingImage] = useState<ImagePicker.ImagePickerAsset | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((res) => {
        if (cancelled) return;
        const name = res.user.display_name;
        setDisplayName(name);
        setInitialName(name);
        setAvatarUrl(res.user.avatar_url);
      })
      .catch(() => {
        if (!cancelled) Alert.alert("Couldn't load profile", 'Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  async function handlePickImage(): Promise<void> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow photo access in Settings to choose a profile picture.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    setPendingImage(result.assets[0]);
  }

  async function handleSave(): Promise<void> {
    const trimmed = displayName.trim();
    if (trimmed.length === 0) {
      Alert.alert('Name required', 'Please enter a display name.');
      return;
    }

    const patch: schemas.UpdateMeRequest = {};
    if (trimmed !== initialName) patch.display_name = trimmed;

    setSaving(true);
    try {
      // Upload a newly-picked photo first so avatar_url points at the stored object.
      if (pendingImage) {
        const contentType = resolveContentType(pendingImage.mimeType);
        const presign = await requestAvatarUploadUrl(contentType);
        if (pendingImage.fileSize != null && pendingImage.fileSize > presign.max_bytes) {
          Alert.alert('Image too large', 'Please choose an image under 5 MB.');
          setSaving(false);
          return;
        }
        await uploadAvatarFile(presign.upload_url, pendingImage.uri, contentType);
        patch.avatar_url = presign.public_url;
      }

      if (Object.keys(patch).length === 0) {
        // Nothing changed — just close.
        onDone();
        return;
      }

      await updateMe(patch);
      onDone();
    } catch {
      Alert.alert("Couldn't save changes", 'Please check your connection and try again.');
      setSaving(false);
    }
  }

  const previewUri = pendingImage?.uri ?? avatarUrl;
  const nameTooLong = displayName.length > DISPLAY_NAME_MAX;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarSection}>
          <TouchableOpacity
            onPress={() => void handlePickImage()}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            testID="edit-profile-pick-photo"
            disabled={loading || saving}
            activeOpacity={0.8}
          >
            <View style={styles.avatarRing}>
              <Avatar name={displayName.length > 0 ? displayName : 'You'} uri={previewUri} size={AVATAR_SIZE} />
            </View>
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={16} color={theme.color.onBrand} />
            </View>
          </TouchableOpacity>
          <Text variant="bodySm" tone="brand" style={styles.changePhotoHint}>
            Change photo
          </Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text variant="bodySm" style={styles.label}>
            Display name
          </Text>
          {/* FormField is avoided here so the controlled value/error stay local. */}
          <TextInputField
            value={displayName}
            onChangeText={setDisplayName}
            editable={!loading && !saving}
            hasError={nameTooLong}
          />
          {nameTooLong ? (
            <Text variant="caption" tone="error">
              Display name must be {DISPLAY_NAME_MAX} characters or fewer.
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Button
            label="Save"
            onPress={() => void handleSave()}
            loading={saving}
            disabled={loading || nameTooLong}
            testID="edit-profile-save"
          />
          <Button
            label="Cancel"
            variant="ghost"
            onPress={onDone}
            disabled={saving}
            testID="edit-profile-cancel"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Small controlled TextInput matching FormField's surface styling. Inlined so
// the EditProfile error state stays in one place.
interface TextInputFieldProps {
  value: string;
  onChangeText: (next: string) => void;
  editable: boolean;
  hasError: boolean;
}

function TextInputField({ value, onChangeText, editable, hasError }: TextInputFieldProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      accessibilityLabel="Display name"
      testID="edit-profile-name-input"
      placeholder="Your name"
      placeholderTextColor={theme.color.textMuted}
      maxLength={DISPLAY_NAME_MAX + 10}
      style={[styles.input, hasError ? styles.inputError : null, !editable ? styles.inputDisabled : null]}
    />
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    body: { padding: theme.space(4), gap: theme.space(5) },
    avatarSection: { alignItems: 'center', paddingTop: theme.space(4) },
    avatarRing: {
      padding: theme.space(1),
      borderRadius: 999,
      borderWidth: 2,
      borderColor: theme.color.brand,
    },
    editBadge: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.color.brand,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.color.bg,
    },
    changePhotoHint: { marginTop: theme.space(2), fontWeight: theme.weight.semibold },
    fieldGroup: { gap: theme.space(2) },
    label: { fontWeight: theme.weight.medium },
    input: {
      width: '100%',
      paddingHorizontal: theme.space(4),
      paddingVertical: theme.space(3),
      fontSize: theme.type.body,
      color: theme.color.text,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      borderRadius: theme.radius.md,
    },
    inputError: { borderColor: theme.color.error },
    inputDisabled: { opacity: 0.55 },
    actions: { gap: theme.space(3), marginTop: theme.space(2) },
  });
}
