import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: ['../stories/**/*.stories.@(ts|tsx|mdx)'],
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
    '@storybook/addon-docs',
  ],
  staticDirs: [{ from: '../../../apps/web/public/fonts', to: '/fonts' }],
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
};

export default config;
