import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { CategoryTabs } from '../src/components/CategoryTabs/CategoryTabs.js';
import type { CategoryTabOption } from '../src/components/CategoryTabs/CategoryTabs.js';

const ALL_OPTIONS: ReadonlyArray<CategoryTabOption> = [
  { value: '', label: 'All', count: 24 },
  { value: 'diet', label: 'Diet', count: 8 },
  { value: 'protein', label: 'High Protein', count: 6 },
  { value: 'vegetarian', label: 'Vegetarian', count: 5 },
  { value: 'general', label: 'General', count: 5 },
];

const meta: Meta<typeof CategoryTabs> = {
  title: 'Composite/CategoryTabs',
  component: CategoryTabs,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof CategoryTabs>;

export const Default: Story = {
  args: {
    id: 'category-tabs',
    options: ALL_OPTIONS,
    value: '',
  },
};

export const Controlled: Story = {
  render: (args) => {
    const [value, setValue] = useState('diet');
    return <CategoryTabs {...args} value={value} onChange={setValue} />;
  },
  args: {
    id: 'category-tabs-controlled',
    options: ALL_OPTIONS,
  },
};

export const NoCounts: Story = {
  args: {
    id: 'category-tabs-no-counts',
    options: [
      { value: '', label: 'All' },
      { value: 'diet', label: 'Diet' },
      { value: 'protein', label: 'High Protein' },
      { value: 'vegetarian', label: 'Vegetarian' },
      { value: 'general', label: 'General' },
    ],
    value: '',
  },
};

export const WithDisabled: Story = {
  args: {
    id: 'category-tabs-disabled',
    options: [
      { value: '', label: 'All', count: 24 },
      { value: 'diet', label: 'Diet', count: 8 },
      { value: 'protein', label: 'High Protein', count: 0, disabled: true },
      { value: 'vegetarian', label: 'Vegetarian', count: 5 },
      { value: 'general', label: 'General', count: 5 },
    ],
    value: '',
  },
};
