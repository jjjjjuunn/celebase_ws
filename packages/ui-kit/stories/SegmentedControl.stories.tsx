import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SegmentedControl } from '../src/components/SegmentedControl/SegmentedControl.js';
import type {
  SegmentedControlOption,
  SegmentedControlProps,
} from '../src/components/SegmentedControl/SegmentedControl.js';

type ActivityValue = 'sedentary' | 'light' | 'moderate' | 'active' | 'very-active';

const activityOptions: ReadonlyArray<SegmentedControlOption<ActivityValue>> = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very-active', label: 'Very active' },
];

type RangeValue = 'week' | 'month';

const rangeOptions: ReadonlyArray<SegmentedControlOption<RangeValue>> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

type ControlledArgs<T extends string> = Omit<
  SegmentedControlProps<T>,
  'value' | 'onChange'
> & {
  initial: T;
};

function ControlledTemplate<T extends string>(args: ControlledArgs<T>): JSX.Element {
  const { initial, ...rest } = args;
  const [value, setValue] = useState<T>(initial);
  return <SegmentedControl<T> {...rest} value={value} onChange={setValue} />;
}

const meta: Meta<typeof SegmentedControl> = {
  title: 'Composite/SegmentedControl',
  component: SegmentedControl,
};
export default meta;

type Story = StoryObj<typeof SegmentedControl>;

export const ActivityFive: Story = {
  render: () => (
    <ControlledTemplate<ActivityValue>
      id="sc-activity"
      ariaLabel="Activity level"
      options={activityOptions}
      initial="moderate"
    />
  ),
};

export const WeekMonth: Story = {
  render: () => (
    <ControlledTemplate<RangeValue>
      id="sc-range"
      ariaLabel="Time range"
      options={rangeOptions}
      initial="week"
    />
  ),
};

export const SmallSize: Story = {
  render: () => (
    <ControlledTemplate<RangeValue>
      id="sc-range-sm"
      ariaLabel="Time range"
      options={rangeOptions}
      initial="week"
      size="sm"
    />
  ),
};

export const WithDisabledOption: Story = {
  render: () => (
    <ControlledTemplate<ActivityValue>
      id="sc-activity-partial"
      ariaLabel="Activity level"
      initial="light"
      options={[
        { value: 'sedentary', label: 'Sedentary' },
        { value: 'light', label: 'Light' },
        { value: 'moderate', label: 'Moderate' },
        { value: 'active', label: 'Active', disabled: true },
        { value: 'very-active', label: 'Very active', disabled: true },
      ]}
    />
  ),
};

export const AllDisabled: Story = {
  render: () => (
    <ControlledTemplate<RangeValue>
      id="sc-range-all-disabled"
      ariaLabel="Time range"
      options={rangeOptions}
      initial="week"
      disabled
    />
  ),
};
