import type { Meta, StoryObj } from '@storybook/react';
import { CelebrityCard } from '../src/components/CelebrityCard/CelebrityCard.js';

const PLACEHOLDER_AVATAR = 'https://placehold.co/400x300/e8e4dc/8b6d2f?text=Photo';

const meta: Meta<typeof CelebrityCard> = {
  title: 'Composite/CelebrityCard',
  component: CelebrityCard,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CelebrityCard>;

export const Default: Story = {
  args: {
    data: {
      slug: 'tom-brady',
      displayName: 'Tom Brady',
      shortBio: 'TB12 Method — anti-inflammatory whole foods diet',
      avatarUrl: PLACEHOLDER_AVATAR,
      coverImageUrl: null,
      category: 'diet',
      tags: ['anti-inflammatory', 'whole-foods'],
      isFeatured: false,
    },
    onClick: (slug) => {
      // eslint-disable-next-line no-console
      console.log('clicked', slug);
    },
  },
};

export const Featured: Story = {
  args: {
    data: {
      slug: 'gisele-bundchen',
      displayName: 'Gisele Bündchen',
      shortBio: 'Plant-based diet with whole grains and seasonal vegetables',
      avatarUrl: PLACEHOLDER_AVATAR,
      coverImageUrl: null,
      category: 'vegetarian',
      tags: ['plant-based', 'seasonal'],
      isFeatured: true,
    },
    onClick: (slug) => {
      // eslint-disable-next-line no-console
      console.log('clicked', slug);
    },
  },
};

export const HighProtein: Story = {
  args: {
    data: {
      slug: 'dwayne-johnson',
      displayName: 'Dwayne Johnson',
      shortBio: 'High-protein diet with structured cheat meals',
      avatarUrl: PLACEHOLDER_AVATAR,
      coverImageUrl: null,
      category: 'protein',
      tags: ['high-protein', 'strength'],
      isFeatured: false,
    },
    onClick: undefined,
  },
};

export const NoSubtitle: Story = {
  args: {
    data: {
      slug: 'serena-williams',
      displayName: 'Serena Williams',
      shortBio: null,
      avatarUrl: PLACEHOLDER_AVATAR,
      coverImageUrl: null,
      category: 'general',
      tags: [],
      isFeatured: false,
    },
  },
};

export const WithCoverImage: Story = {
  args: {
    data: {
      slug: 'lebron-james',
      displayName: 'LeBron James',
      shortBio: 'Elite performance nutrition with focus on recovery',
      avatarUrl: PLACEHOLDER_AVATAR,
      coverImageUrl: 'https://placehold.co/400x300/1a1917/e8e4dc?text=Cover',
      category: 'protein',
      tags: ['performance', 'recovery'],
      isFeatured: true,
    },
    onClick: (slug) => {
      // eslint-disable-next-line no-console
      console.log('clicked', slug);
    },
  },
};
