import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SelectField } from '../src/components/SelectField/SelectField.js';
import type { SelectFieldOption, SelectFieldProps } from '../src/components/SelectField/SelectField.js';

const activityOptions: ReadonlyArray<SelectFieldOption> = [
  { value: 'sedentary', label: 'Sedentary (little or no exercise)' },
  { value: 'light', label: 'Light (1–3 days/week)' },
  { value: 'moderate', label: 'Moderate (3–5 days/week)' },
  { value: 'active', label: 'Active (6–7 days/week)' },
  { value: 'very-active', label: 'Very active (athlete / physical job)' },
];

type ControlledArgs = Omit<SelectFieldProps, 'value' | 'onChange' | 'options'> & {
  options?: ReadonlyArray<SelectFieldOption>;
  initial?: string;
};

function ControlledTemplate(args: ControlledArgs): JSX.Element {
  const { options = activityOptions, initial = '', ...rest } = args;
  const [value, setValue] = useState<string>(initial);
  return <SelectField {...rest} options={options} value={value} onChange={setValue} />;
}

const meta: Meta<typeof SelectField> = {
  title: 'Composite/SelectField',
  component: SelectField,
};
export default meta;

type Story = StoryObj<typeof SelectField>;

export const Default: Story = {
  render: () => (
    <ControlledTemplate
      id="activity-default"
      label="Activity Level"
      placeholder="-- select --"
    />
  ),
};

export const WithHelper: Story = {
  render: () => (
    <ControlledTemplate
      id="activity-helper"
      label="Activity Level"
      placeholder="-- select --"
      helperText="This helps calculate your TDEE."
    />
  ),
};

export const Error: Story = {
  render: () => (
    <ControlledTemplate
      id="activity-error"
      label="Activity Level"
      placeholder="-- select --"
      error="Activity level is required."
    />
  ),
};

export const ErrorPlusHelper: Story = {
  render: () => (
    <ControlledTemplate
      id="activity-error-helper"
      label="Activity Level"
      placeholder="-- select --"
      error="Activity level is required."
      helperText="This helps calculate your TDEE."
    />
  ),
};

export const Required: Story = {
  render: () => (
    <ControlledTemplate
      id="activity-required"
      label="Activity Level"
      placeholder="-- select --"
      required
    />
  ),
};

export const Disabled: Story = {
  render: () => (
    <ControlledTemplate
      id="activity-disabled"
      label="Activity Level"
      placeholder="-- select --"
      disabled
      initial="moderate"
    />
  ),
};

export const WithDisabledOption: Story = {
  render: () => (
    <ControlledTemplate
      id="diet-disabled-option"
      label="Diet preference"
      placeholder="-- select --"
      options={[
        { value: 'balanced', label: 'Balanced' },
        { value: 'keto', label: 'Keto (unavailable)', disabled: true },
        { value: 'mediterranean', label: 'Mediterranean' },
      ]}
    />
  ),
};
