import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SlotChip } from '../src/components/SlotChip/SlotChip.js';
import { SlotChipGroup } from '../src/components/SlotChip/SlotChipGroup.js';

const meta: Meta<typeof SlotChipGroup> = {
  title: 'Composite/SlotChip',
  component: SlotChipGroup,
};
export default meta;

type Story = StoryObj<typeof SlotChipGroup>;

export const Default: Story = {
  render: () => {
    function Controlled(): JSX.Element {
      const [value, setValue] = useState<string>('10:00');
      return (
        <SlotChipGroup ariaLabel="Pick a time slot" value={value} onChange={setValue}>
          <SlotChip value="09:00" timeLabel="9:00 AM" priceLabel="$25" />
          <SlotChip value="09:30" timeLabel="9:30 AM" priceLabel="$25" />
          <SlotChip value="10:00" timeLabel="10:00 AM" priceLabel="$25" />
          <SlotChip value="10:30" timeLabel="10:30 AM" priceLabel="$25" />
          <SlotChip value="11:00" timeLabel="11:00 AM" priceLabel="$25" />
          <SlotChip value="11:30" timeLabel="11:30 AM" priceLabel="$25" />
        </SlotChipGroup>
      );
    }
    return <Controlled />;
  },
};

export const WithFreeBadge: Story = {
  render: () => {
    function Controlled(): JSX.Element {
      const [value, setValue] = useState<string>('14:00');
      return (
        <SlotChipGroup ariaLabel="Pick a consultation slot" value={value} onChange={setValue}>
          <SlotChip value="13:00" timeLabel="1:00 PM" priceLabel="Free" isFreeBadge />
          <SlotChip value="13:30" timeLabel="1:30 PM" priceLabel="$50" />
          <SlotChip value="14:00" timeLabel="2:00 PM" priceLabel="$50" />
          <SlotChip value="14:30" timeLabel="2:30 PM" priceLabel="Free" isFreeBadge />
        </SlotChipGroup>
      );
    }
    return <Controlled />;
  },
};

export const WithFullSlots: Story = {
  render: () => {
    function Controlled(): JSX.Element {
      const [value, setValue] = useState<string>('16:00');
      return (
        <SlotChipGroup ariaLabel="Pick a time slot" value={value} onChange={setValue}>
          <SlotChip value="15:00" timeLabel="3:00 PM" priceLabel="$30" disabled />
          <SlotChip value="15:30" timeLabel="3:30 PM" priceLabel="$30" />
          <SlotChip value="16:00" timeLabel="4:00 PM" priceLabel="$30" />
          <SlotChip value="16:30" timeLabel="4:30 PM" priceLabel="$30" disabled />
          <SlotChip value="17:00" timeLabel="5:00 PM" priceLabel="$30" />
        </SlotChipGroup>
      );
    }
    return <Controlled />;
  },
};

export const AllDisabled: Story = {
  render: () => {
    function Controlled(): JSX.Element {
      const [value, setValue] = useState<string>('');
      return (
        <SlotChipGroup ariaLabel="No slots available" value={value} onChange={setValue}>
          <SlotChip value="18:00" timeLabel="6:00 PM" priceLabel="$40" disabled />
          <SlotChip value="18:30" timeLabel="6:30 PM" priceLabel="$40" disabled />
          <SlotChip value="19:00" timeLabel="7:00 PM" priceLabel="$40" disabled />
        </SlotChipGroup>
      );
    }
    return <Controlled />;
  },
};
