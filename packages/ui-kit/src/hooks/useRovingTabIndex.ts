import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface RovingOption<T extends string> {
  value: T;
  disabled?: boolean;
}

export interface UseRovingTabIndexArgs<T extends string> {
  options: ReadonlyArray<RovingOption<T>>;
  value: T | '';
  onChange: (value: T) => void;
  orientation?: 'horizontal' | 'vertical' | 'both';
}

export interface UseRovingTabIndexReturn {
  activeIndex: number;
  allDisabled: boolean;
  itemProps: (index: number) => {
    tabIndex: 0 | -1;
    ref: (el: HTMLElement | null) => void;
  };
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

function findFirstEnabled<T extends string>(
  options: ReadonlyArray<RovingOption<T>>,
): number {
  for (let i = 0; i < options.length; i += 1) {
    const opt = options[i];
    if (opt !== undefined && opt.disabled !== true) return i;
  }
  return -1;
}

function findIndexByValue<T extends string>(
  options: ReadonlyArray<RovingOption<T>>,
  value: T | '',
): number {
  if (value === '') return -1;
  for (let i = 0; i < options.length; i += 1) {
    const opt = options[i];
    if (opt !== undefined && opt.value === value && opt.disabled !== true) return i;
  }
  return -1;
}

function stepEnabled<T extends string>(
  options: ReadonlyArray<RovingOption<T>>,
  from: number,
  delta: 1 | -1,
): number {
  const n = options.length;
  if (n === 0) return -1;
  let idx = from;
  for (let i = 0; i < n; i += 1) {
    idx = (idx + delta + n) % n;
    const opt = options[idx];
    if (opt !== undefined && opt.disabled !== true) return idx;
  }
  return -1;
}

export function useRovingTabIndex<T extends string>(
  args: UseRovingTabIndexArgs<T>,
): UseRovingTabIndexReturn {
  const { options, value, onChange, orientation = 'horizontal' } = args;

  const itemsRef = useRef<Array<HTMLElement | null>>([]);
  const activeIndexRef = useRef<number>(-1);
  const lastActiveRef = useRef<number>(-1);

  const allDisabled = options.every((o) => o.disabled === true);

  const resolveActiveIndex = useCallback((): number => {
    const byValue = findIndexByValue(options, value);
    if (byValue !== -1) return byValue;
    const last = lastActiveRef.current;
    if (last >= 0 && last < options.length) {
      const lastOpt = options[last];
      if (lastOpt !== undefined && lastOpt.disabled !== true) return last;
    }
    return findFirstEnabled(options);
  }, [options, value]);

  const [activeIndex, setActiveIndex] = useState<number>(() => resolveActiveIndex());

  useEffect(() => {
    const next = resolveActiveIndex();
    activeIndexRef.current = next;
    if (next !== -1) lastActiveRef.current = next;
    setActiveIndex(next);
  }, [resolveActiveIndex]);

  const moveTo = useCallback(
    (newIdx: number): void => {
      if (newIdx === -1 || newIdx === activeIndexRef.current) return;
      const target = options[newIdx];
      if (target === undefined) return;
      activeIndexRef.current = newIdx;
      lastActiveRef.current = newIdx;
      setActiveIndex(newIdx);
      itemsRef.current[newIdx]?.focus();
      onChange(target.value);
    },
    [onChange, options],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>): void => {
      if (allDisabled) return;
      const current = activeIndexRef.current;
      if (current === -1) return;

      const horizontal = orientation === 'horizontal' || orientation === 'both';
      const vertical = orientation === 'vertical' || orientation === 'both';

      let nextIdx = current;
      let handled = false;

      switch (e.key) {
        case 'ArrowRight':
          if (horizontal) {
            nextIdx = stepEnabled(options, current, 1);
            handled = true;
          }
          break;
        case 'ArrowLeft':
          if (horizontal) {
            nextIdx = stepEnabled(options, current, -1);
            handled = true;
          }
          break;
        case 'ArrowDown':
          if (vertical) {
            nextIdx = stepEnabled(options, current, 1);
            handled = true;
          }
          break;
        case 'ArrowUp':
          if (vertical) {
            nextIdx = stepEnabled(options, current, -1);
            handled = true;
          }
          break;
        case 'Home': {
          nextIdx = findFirstEnabled(options);
          handled = true;
          break;
        }
        case 'End': {
          let last = -1;
          for (let i = options.length - 1; i >= 0; i -= 1) {
            const opt = options[i];
            if (opt !== undefined && opt.disabled !== true) {
              last = i;
              break;
            }
          }
          nextIdx = last;
          handled = true;
          break;
        }
        case ' ':
        case 'Enter': {
          e.preventDefault();
          const currentOpt = options[current];
          if (currentOpt !== undefined && currentOpt.disabled !== true) {
            const currentValue = currentOpt.value;
            if (currentValue !== value) onChange(currentValue);
          }
          return;
        }
        default:
          return;
      }

      if (handled) {
        e.preventDefault();
        moveTo(nextIdx);
      }
    },
    [allDisabled, moveTo, onChange, options, orientation, value],
  );

  const itemProps = useCallback(
    (index: number) => ({
      tabIndex: index === activeIndex ? (0 as const) : (-1 as const),
      ref: (el: HTMLElement | null) => {
        itemsRef.current[index] = el;
      },
    }),
    [activeIndex],
  );

  return { activeIndex, allDisabled, itemProps, onKeyDown };
}
