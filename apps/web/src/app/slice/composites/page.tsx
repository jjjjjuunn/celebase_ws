'use client';

import { useState } from 'react';
import type { ChangeEvent, CSSProperties, JSX } from 'react';
import {
  Chip,
  IngredientSwapCard,
  InputField,
  MealCard,
  NutritionRing,
  SegmentedControl,
  SelectField,
  SlotChip,
  SlotChipGroup,
  SourceTrackingBadge,
  Stack,
  Text,
  TrafficLightIndicator,
} from '@celebbase/ui-kit';

const SECTION_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--cb-space-4)',
  padding: 'var(--cb-space-5)',
  border: '1px solid var(--cb-color-border)',
  borderRadius: 'var(--cb-radius-lg)',
  background: 'var(--cb-color-surface)',
};

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--cb-space-3)',
  alignItems: 'center',
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: JSX.Element;
}): JSX.Element {
  return (
    <section id={id} style={SECTION_STYLE} aria-labelledby={`${id}-heading`}>
      <Text as="h2" variant="heading" size="xl" id={`${id}-heading`}>
        {title}
      </Text>
      {children}
    </section>
  );
}

const DIET_OPTIONS = [
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'keto', label: 'Keto' },
  { value: 'paleo', label: 'Paleo' },
  { value: 'vegan', label: 'Vegan' },
] as const;

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'very', label: 'Very active' },
  { value: 'extra', label: 'Extra active' },
] as const;

const REGION_OPTIONS = [{ value: 'us', label: 'US' }] as const;

const WEEK_MONTH_OPTIONS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const;

const DISABLED_RANGE_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
] as const;

const DIET_KEYS = ['mediterranean', 'keto', 'paleo', 'vegan'] as const;

export default function CompositesPreview(): JSX.Element {
  const [emailValue, setEmailValue] = useState<string>('');
  const [fullNameValue, setFullNameValue] = useState<string>('');
  const fullNameError =
    fullNameValue.trim() === '' ? 'Please enter your full name.' : undefined;

  const [dietValue, setDietValue] = useState<string>('');
  const [activityValue, setActivityValue] = useState<string>('');
  const activityError =
    activityValue === '' ? 'Please choose an activity level.' : undefined;
  const [regionValue] = useState<string>('us');

  const [activitySegment, setActivitySegment] = useState<string>('moderate');
  const [rangeSegment, setRangeSegment] = useState<string>('week');
  const [disabledRange, setDisabledRange] = useState<string>('day');

  const [toggledDiets, setToggledDiets] = useState<Set<string>>(new Set(['keto']));
  const toggleDiet = (key: string): void => {
    setToggledDiets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const [removableTags, setRemovableTags] = useState<string[]>([
    'Gluten-free',
    'Dairy-free',
  ]);
  const [highProtein, setHighProtein] = useState<boolean>(true);

  const [morningSlot, setMorningSlot] = useState<string>('10:00');
  const [introSlot, setIntroSlot] = useState<string>('14:00');
  const [afternoonSlot, setAfternoonSlot] = useState<string>('16:00');

  return (
    <Stack direction="column" gap="6" as="main">
      <header>
        <Text as="h1" variant="display" size="2xl">
          Composites
        </Text>
        <Text as="p" tone="muted">
          IMPL-UI-003 — InputField, SelectField, SegmentedControl, Chip, SlotChip +
          SlotChipGroup. Verify: keyboard nav, aria wiring, 44px/52px touch
          targets, WCAG 4.5:1, light/dark.
        </Text>
      </header>

      <Section id="inputfield" title="InputField">
        <Stack direction="column" gap="3">
          <InputField
            id="composite-input-default"
            label="Email address"
            helperText="We'll never share your email."
            value={emailValue}
            onChange={(e: ChangeEvent<HTMLInputElement>): void => {
              setEmailValue(e.target.value);
            }}
          />
          <InputField
            id="composite-input-required"
            label="Full name"
            required
            {...(fullNameError ? { error: fullNameError } : {})}
            value={fullNameValue}
            onChange={(e: ChangeEvent<HTMLInputElement>): void => {
              setFullNameValue(e.target.value);
            }}
          />
          <InputField
            id="composite-input-disabled"
            label="Locked field"
            disabled
            defaultValue="locked"
          />
        </Stack>
      </Section>

      <Section id="selectfield" title="SelectField">
        <Stack direction="column" gap="3">
          <SelectField
            id="composite-select-default"
            label="Diet preference"
            placeholder="-- select --"
            options={DIET_OPTIONS}
            value={dietValue}
            onChange={setDietValue}
            helperText="Choose the diet you want to explore."
          />
          <SelectField
            id="composite-select-required"
            label="Activity level"
            required
            placeholder="-- select --"
            options={ACTIVITY_OPTIONS}
            value={activityValue}
            onChange={setActivityValue}
            {...(activityError ? { error: activityError } : {})}
          />
          <SelectField
            id="composite-select-disabled"
            label="Region"
            disabled
            options={REGION_OPTIONS}
            value={regionValue}
            onChange={(): void => {
              /* no-op: disabled */
            }}
          />
        </Stack>
      </Section>

      <Section id="segmented" title="SegmentedControl">
        <Stack direction="column" gap="3">
          <SegmentedControl
            id="composite-segmented-activity"
            ariaLabel="Activity level"
            options={ACTIVITY_OPTIONS}
            value={activitySegment}
            onChange={setActivitySegment}
            size="md"
          />
          <SegmentedControl
            id="composite-segmented-week-month"
            ariaLabel="Time range"
            options={WEEK_MONTH_OPTIONS}
            value={rangeSegment}
            onChange={setRangeSegment}
            size="sm"
          />
          <SegmentedControl
            id="composite-segmented-disabled"
            ariaLabel="Disabled range"
            options={DISABLED_RANGE_OPTIONS}
            value={disabledRange}
            onChange={setDisabledRange}
            disabled
          />
        </Stack>
      </Section>

      <Section id="chip" title="Chip">
        <Stack direction="column" gap="3">
          <div style={ROW_STYLE}>
            <Chip label="Gluten-free" />
          </div>
          <div style={ROW_STYLE}>
            {DIET_KEYS.map((key) => (
              <Chip
                key={key}
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                selected={toggledDiets.has(key)}
                onToggle={(): void => {
                  toggleDiet(key);
                }}
              />
            ))}
          </div>
          <div style={ROW_STYLE}>
            {removableTags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                onRemove={(): void => {
                  setRemovableTags((prev) => prev.filter((t) => t !== tag));
                }}
              />
            ))}
            {removableTags.length === 0 ? (
              <Text as="span" variant="label" tone="muted">
                All tags removed.
              </Text>
            ) : null}
          </div>
          <div style={ROW_STYLE}>
            <Chip
              label="High protein"
              selected={highProtein}
              onToggle={(): void => {
                setHighProtein((v) => !v);
              }}
              onRemove={(): void => {
                setHighProtein(false);
              }}
            />
          </div>
          <div style={ROW_STYLE}>
            <Chip label="Keto" disabled />
            <Chip
              label="Paleo"
              disabled
              selected
              onToggle={(): void => {
                /* disabled no-op */
              }}
            />
          </div>
        </Stack>
      </Section>

      <Section id="slotchip" title="SlotChip / SlotChipGroup">
        <Stack direction="column" gap="4">
          <SlotChipGroup
            ariaLabel="Pick a morning time slot"
            value={morningSlot}
            onChange={setMorningSlot}
          >
            <SlotChip value="09:00" timeLabel="9:00 AM" priceLabel="$25" />
            <SlotChip value="09:30" timeLabel="9:30 AM" priceLabel="$25" />
            <SlotChip value="10:00" timeLabel="10:00 AM" priceLabel="$25" />
            <SlotChip value="10:30" timeLabel="10:30 AM" priceLabel="$25" />
            <SlotChip value="11:00" timeLabel="11:00 AM" priceLabel="$25" />
            <SlotChip value="11:30" timeLabel="11:30 AM" priceLabel="$25" />
          </SlotChipGroup>
          <SlotChipGroup
            ariaLabel="Pick an intro consult slot"
            value={introSlot}
            onChange={setIntroSlot}
          >
            <SlotChip
              value="13:00"
              timeLabel="1:00 PM"
              priceLabel="Free"
              isFreeBadge
            />
            <SlotChip value="13:30" timeLabel="1:30 PM" priceLabel="$50" />
            <SlotChip value="14:00" timeLabel="2:00 PM" priceLabel="$50" />
            <SlotChip
              value="14:30"
              timeLabel="2:30 PM"
              priceLabel="Free"
              isFreeBadge
            />
          </SlotChipGroup>
          <SlotChipGroup
            ariaLabel="Pick an afternoon slot"
            value={afternoonSlot}
            onChange={setAfternoonSlot}
          >
            <SlotChip value="15:00" timeLabel="3:00 PM" priceLabel="$30" disabled />
            <SlotChip value="15:30" timeLabel="3:30 PM" priceLabel="$30" />
            <SlotChip value="16:00" timeLabel="4:00 PM" priceLabel="$30" />
            <SlotChip value="16:30" timeLabel="4:30 PM" priceLabel="$30" disabled />
            <SlotChip value="17:00" timeLabel="5:00 PM" priceLabel="$30" />
          </SlotChipGroup>
        </Stack>
      </Section>

      <Section id="traffic-light" title="TrafficLightIndicator">
        <Stack direction="column" gap="3">
          <div style={ROW_STYLE}>
            <TrafficLightIndicator status="green" />
            <TrafficLightIndicator status="orange" />
            <TrafficLightIndicator status="red" />
            <TrafficLightIndicator status="green" label="Cleared for your allergies" />
            <TrafficLightIndicator status="orange" size="sm" label="Sodium moderate" />
          </div>
          <Text variant="body" size="sm" tone="muted">
            Swap-context variant is rendered inside IngredientSwapCard below.
          </Text>
        </Stack>
      </Section>

      <Section id="source-tracking" title="SourceTrackingBadge">
        <div style={ROW_STYLE}>
          <SourceTrackingBadge
            sourceLabel="Vogue 2024"
            href="https://www.vogue.com/"
            verifiedAt="2024-11"
          />
          <SourceTrackingBadge
            sourceLabel="Harvard Med News"
            href="https://hms.harvard.edu/news"
            verifiedAt="2025-03"
          />
          <SourceTrackingBadge sourceLabel="USDA FDC" href="https://fdc.nal.usda.gov/" />
        </div>
      </Section>

      <Section id="nutrition-ring" title="NutritionRing (brand + persona tones)">
        <div style={ROW_STYLE}>
          <NutritionRing value={42} label="Adherence" tone="brand" size="sm" />
          <NutritionRing
            value={78}
            label="Adherence"
            subLabel="Target 2150 kcal"
            tone="brand"
            size="md"
          />
          <NutritionRing
            value={100}
            label="Sync"
            subLabel="Tom Brady persona"
            tone="persona"
            size="lg"
          />
        </div>
      </Section>

      <Section id="meal-card" title="MealCard">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'var(--cb-space-4)',
          }}
        >
          <MealCard
            title="Quinoa bowl with seared salmon"
            celebrityTag="Tom Brady"
            mealType="Lunch"
            kcal={620}
            safetyStatus="green"
            onShopIngredients={() => {
              // demo slot — wired in fulfillment feature later
            }}
            sourceBadge={
              <SourceTrackingBadge
                sourceLabel="Vogue 2024"
                href="https://www.vogue.com/"
                verifiedAt="2024-11"
              />
            }
          />
          <MealCard
            title="Mediterranean mezze plate"
            celebrityTag="Gwyneth Paltrow"
            mealType="Dinner"
            kcal={540}
            safetyStatus="orange"
          />
        </div>
      </Section>

      <Section id="ingredient-swap" title="IngredientSwapCard (Safety Bridge framing)">
        <Stack direction="column" gap="4">
          <IngredientSwapCard
            status="green"
            original={{ name: 'Almond milk', note: 'in original recipe' }}
            replacement={{ name: 'Oat milk', note: 'suggested by AI' }}
            reason="Your profile flags a tree-nut allergy. Oat milk keeps the creamy texture and matches macros within 3%."
          >
            This suggestion considers your recorded allergies and is for educational
            purposes only — not medical advice.
          </IngredientSwapCard>

          <IngredientSwapCard
            status="orange"
            original={{ name: 'Raw salmon' }}
            replacement={{ name: 'Seared salmon' }}
            reason="You indicated pregnancy in onboarding. Fully cooked replaces raw to lower listeria exposure risk."
          >
            Not a medical diagnosis. Consult a clinician for your specific case.
          </IngredientSwapCard>
        </Stack>
      </Section>
    </Stack>
  );
}
