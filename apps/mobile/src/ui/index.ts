// CelebBase mobile design system — themed primitives.
// Import from '../ui' (or '@/ui') instead of re-declaring per-screen StyleSheets.

export { ThemeProvider, useTheme, useThemeMode, themeFollowsSystem } from './ThemeProvider';
export { getTheme, lightTheme, darkTheme } from './theme';
export type { Theme, ThemeMode, SpaceStep, TextWeight } from './theme';

export { Text } from './Text';
export type { TextVariant, TextTone } from './Text';
export { Button } from './Button';
export type { ButtonVariant, ButtonSize } from './Button';
export { Card } from './Card';
export type { CardVariant } from './Card';
export { Avatar } from './Avatar';
export { Badge } from './Badge';
export type { BadgeTone } from './Badge';
export { Skeleton } from './Skeleton';
export { EmptyState } from './EmptyState';
export { Screen } from './Screen';
