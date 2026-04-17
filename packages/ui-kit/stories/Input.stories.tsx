import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '../src/components/Input/Input.js';

const meta: Meta<typeof Input> = {
  title: 'Primitives/Input',
  component: Input,
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { id: 'email-default', label: 'Email', placeholder: 'you@example.com' },
};

export const WithHelper: Story = {
  args: {
    id: 'email-helper',
    label: 'Email',
    placeholder: 'you@example.com',
    helperText: "We'll only use this for account recovery.",
  },
};

export const Required: Story = {
  args: {
    id: 'name-required',
    label: 'Display name',
    placeholder: 'Jane Doe',
    required: true,
  },
};

export const Error: Story = {
  args: {
    id: 'email-error',
    label: 'Email',
    value: 'not-an-email',
    state: 'error',
    errorText: 'Please enter a valid email address.',
  },
};

export const Disabled: Story = {
  args: {
    id: 'email-disabled',
    label: 'Email',
    value: 'locked@example.com',
    state: 'disabled',
  },
};
