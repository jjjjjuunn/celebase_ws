import type { ButtonHTMLAttributes, ReactElement } from 'react';
import styles from './SSOButton.module.css';

export type SSOProvider = 'google' | 'apple';

export interface SSOButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  provider: SSOProvider;
  loading?: boolean;
}

const PROVIDER_LABEL: Record<SSOProvider, string> = {
  google: 'Continue with Google',
  apple: 'Continue with Apple',
};

function GoogleIcon(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={styles.icon}
    >
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="currentColor"
        opacity="0.85"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="currentColor"
        opacity="0.75"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="currentColor"
        opacity="0.65"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}

function AppleIcon(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={styles.icon}
    >
      <path
        d="M12.6 0c.07.96-.278 1.916-.87 2.598-.614.71-1.62 1.253-2.6 1.18-.098-.965.344-1.95.9-2.578C10.647.466 11.72-.027 12.6 0zM15.958 12.71c-.384.894-.567 1.293-1.06 2.082-.688 1.106-1.659 2.485-2.863 2.496-1.07.012-1.348-.696-2.8-.688-1.452.008-1.758.702-2.83.69-1.204-.013-2.121-1.26-2.81-2.366-1.929-3.085-2.137-6.706-.94-8.627.845-1.356 2.18-2.148 3.434-2.148 1.28 0 2.083.7 3.14.7 1.026 0 1.652-.702 3.132-.702 1.117 0 2.302.608 3.143 1.658-2.762 1.515-2.313 5.467.454 6.905z"
        fill="currentColor"
      />
    </svg>
  );
}

const PROVIDER_ICON: Record<SSOProvider, () => ReactElement> = {
  google: GoogleIcon,
  apple: AppleIcon,
};

export function SSOButton(props: SSOButtonProps): ReactElement {
  const { provider, loading = false, disabled = false, className, ...rest } = props;

  const isDisabled = disabled || loading;
  const Icon = PROVIDER_ICON[provider];

  const classes = [styles.button, styles[provider], className].filter(Boolean).join(' ');

  return (
    <button
      {...rest}
      type="button"
      className={classes}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : (
        <Icon />
      )}
      <span className={styles.label}>{PROVIDER_LABEL[provider]}</span>
    </button>
  );
}
