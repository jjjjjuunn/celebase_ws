'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  useRef,
} from 'react';
import type {
  ComponentPropsWithRef,
  ReactElement,
  ReactNode,
  Ref,
} from 'react';
import { useRovingTabIndex } from '../../hooks/useRovingTabIndex.js';
import { SlotChip } from './SlotChip.js';
import styles from './SlotChip.module.css';

type SlotChipElementProps = ComponentPropsWithRef<typeof SlotChip>;

export interface SlotChipGroupProps {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

interface ExtractedChild {
  element: ReactElement<SlotChipElementProps>;
  value: string;
  disabled: boolean;
}

function extractSlotChipren(children: ReactNode): Array<ExtractedChild> {
  const array = Children.toArray(children);
  const extracted: Array<ExtractedChild> = [];
  for (const child of array) {
    if (!isValidElement<SlotChipElementProps>(child)) continue;
    if (child.type !== SlotChip) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          '[SlotChipGroup] Only <SlotChip> children are supported. Skipping unsupported child.',
        );
      }
      continue;
    }
    const { value, disabled } = child.props;
    if (typeof value !== 'string' || value.length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('[SlotChipGroup] <SlotChip> requires a non-empty string value.');
      }
      continue;
    }
    extracted.push({ element: child, value, disabled: disabled === true });
  }
  return extracted;
}

export function SlotChipGroup(props: SlotChipGroupProps): ReactElement {
  const { ariaLabel, value, onChange, children, className } = props;

  const extracted = useMemo(() => extractSlotChipren(children), [children]);

  const options = useMemo(
    () => extracted.map((item) => ({ value: item.value, disabled: item.disabled })),
    [extracted],
  );

  const { itemProps, onKeyDown, allDisabled } = useRovingTabIndex<string>({
    options,
    value,
    onChange,
    orientation: 'both',
  });

  const groupRef = useRef<HTMLDivElement | null>(null);

  const classes = [styles.group, className].filter(Boolean).join(' ');

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={allDisabled ? 'true' : undefined}
      onKeyDown={onKeyDown}
      className={classes}
    >
      {extracted.map((item, idx) => {
        const isSelected = value === item.value && !item.disabled;
        const { tabIndex, ref } = itemProps(idx);
        return cloneElement(item.element, {
          key: item.value,
          selected: isSelected,
          tabIndex,
          ref: ref as Ref<HTMLButtonElement>,
          onSelect: () => {
            if (!item.disabled && value !== item.value) onChange(item.value);
          },
        });
      })}
    </div>
  );
}
