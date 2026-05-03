'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './plans-list.module.css';

interface SwipeablePlanCardProps {
  href: string;
  isOpen: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDeleteRequest: () => void;
  children: React.ReactNode;
}

const REVEAL_PX = 88;
const SNAP_THRESHOLD = 40;
const DIRECTION_LOCK_PX = 8;

export function SwipeablePlanCard({
  href,
  isOpen,
  isDeleting,
  onOpen,
  onClose,
  onDeleteRequest,
  children,
}: SwipeablePlanCardProps): React.ReactElement {
  const [dx, setDx] = useState(isOpen ? -REVEAL_PX : 0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const directionLockedRef = useRef<'h' | 'v' | null>(null);
  const baseDxRef = useRef(0);
  const draggedRef = useRef(false);

  useEffect(() => {
    if (!isDragging) {
      setDx(isOpen ? -REVEAL_PX : 0);
    }
  }, [isOpen, isDragging]);

  const handlePointerDown = (event: React.PointerEvent<HTMLAnchorElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    directionLockedRef.current = null;
    baseDxRef.current = isOpen ? -REVEAL_PX : 0;
    draggedRef.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLAnchorElement>): void => {
    if (startXRef.current === null || startYRef.current === null) return;
    const deltaX = event.clientX - startXRef.current;
    const deltaY = event.clientY - startYRef.current;
    if (directionLockedRef.current === null) {
      if (Math.abs(deltaX) < DIRECTION_LOCK_PX && Math.abs(deltaY) < DIRECTION_LOCK_PX) return;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        directionLockedRef.current = 'h';
        setIsDragging(true);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // ignore
        }
      } else {
        directionLockedRef.current = 'v';
        return;
      }
    }
    if (directionLockedRef.current !== 'h') return;
    draggedRef.current = true;
    const next = Math.max(-REVEAL_PX, Math.min(0, baseDxRef.current + deltaX));
    setDx(next);
  };

  const finishGesture = (): void => {
    if (directionLockedRef.current === 'h') {
      const movedFromBase = dx - baseDxRef.current;
      const targetOpen = isOpen ? movedFromBase < SNAP_THRESHOLD : movedFromBase < -SNAP_THRESHOLD;
      if (targetOpen) {
        setDx(-REVEAL_PX);
        if (!isOpen) onOpen();
      } else {
        setDx(0);
        if (isOpen) onClose();
      }
    }
    startXRef.current = null;
    startYRef.current = null;
    directionLockedRef.current = null;
    setIsDragging(false);
  };

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    if (draggedRef.current) {
      event.preventDefault();
      draggedRef.current = false;
      return;
    }
    if (isOpen) {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <li className={styles.swipeRow}>
      <button
        type="button"
        className={styles.deleteRevealBtn}
        onClick={onDeleteRequest}
        disabled={isDeleting}
        aria-label="식단 삭제"
        tabIndex={isOpen ? 0 : -1}
      >
        {isDeleting ? '삭제 중…' : '삭제'}
      </button>
      <Link
        href={href}
        className={styles.card}
        style={{
          transform: `translateX(${String(dx)}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease',
          touchAction: 'pan-y',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={finishGesture}
        onClick={handleClick}
        aria-expanded={isOpen}
      >
        {children}
      </Link>
    </li>
  );
}
