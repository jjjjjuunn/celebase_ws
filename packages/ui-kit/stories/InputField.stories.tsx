import type { Meta, StoryObj } from '@storybook/react-vite';
import { InputField } from '../src/components/InputField/InputField.js';

const meta: Meta<typeof InputField> = {
  title: 'Composite/InputField',
  component: InputField,
};
export default meta;

type Story = StoryObj<typeof InputField>;

export const Default: Story = {
  args: {
    id: 'email-default',
    label: 'Email',
    placeholder: 'you@example.com',
  },
};

export const WithHelper: Story = {
  args: {
    id: 'email-helper',
    label: 'Email',
    placeholder: 'you@example.com',
    helperText: "We'll never share your email.",
  },
};

export const Error: Story = {
  args: {
    id: 'email-error',
    label: 'Email',
    value: 'not-an-email',
    error: 'Email is required.',
  },
};

export const ErrorPlusHelper: Story = {
  args: {
    id: 'email-error-helper',
    label: 'Email',
    value: 'not-an-email',
    error: 'Enter a valid email.',
    helperText: "We'll never share your email.",
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

export const Disabled: Story = {
  args: {
    id: 'email-disabled',
    label: 'Email',
    value: 'locked@example.com',
    disabled: true,
  },
};

export const Numeric: Story = {
  args: {
    id: 'calories-numeric',
    label: 'Daily calories',
    type: 'text',
    inputMode: 'numeric',
    pattern: '[0-9]*',
    align: 'right',
    placeholder: '2000',
    helperText: 'Use `type="text"` + `inputMode="numeric"` for correct mobile keypad.',
  },
};
