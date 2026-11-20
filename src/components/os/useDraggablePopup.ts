import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface UseDraggablePopupOptions {
  /** 'strict' keeps the entire popup inside bounds; 'header' keeps the drag handle inside bounds so large windows can move freely */
  clampMode?: 'strict' | 'header';
  padding?: number;
  handleHeight?: number;
  minVisibleX?: number;
  boundsSelector?: string;
  resetKey?: unknown;
  disabled?: boolean;
}

export function useDraggablePopup(options: UseDraggablePopupOptions = {}) {
  const {
    clampMode = 'strict',
    padding = 6,
    handleHeight = 44,
    minVisibleX = 120,
    boundsSelector = '[data-phone-frame="true"]',
    resetKey,
    disabled = false,
  } = options;

  const popupRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const [isDragging, setIsDragging] = useState(false);
  const justDraggedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const resetPosition = useCallback(() => {
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    setOffset({ x: 0, y: 0 });
  }, [resetKey]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, select, textarea, iframe, [data-no-drag="true"]')) {
        return;
      }

      const el = popupRef.current;
      if (!el) return;

      const boundsEl =
        (boundsSelector ? (el.closest(boundsSelector) as HTMLElement | null) : null) ??
        el.parentElement;

      const elRect = el.getBoundingClientRect();
      const boundsRect = boundsEl
        ? boundsEl.getBoundingClientRect()
        : {
            left: 0,
            top: 0,
            right: window.innerWidth,
            bottom: window.innerHeight,
            width: window.innerWidth,
            height: window.innerHeight,
          };

      const curX = offsetRef.current.x;
      const curY = offsetRef.current.y;
      const startClientX = e.clientX;
      const startClientY = e.clientY;

      const effMinVisibleX = Math.min(minVisibleX, Math.max(48, elRect.width * 0.55));
      const wideBox = elRect.width >= boundsRect.width - padding * 2;
      const tallBox = elRect.height >= boundsRect.height - padding * 2;

      let minDx: number;
      let maxDx: number;
      if (clampMode === 'header' || wideBox) {
        minDx = boundsRect.left + padding + effMinVisibleX - elRect.right;
        maxDx = boundsRect.right - padding - effMinVisibleX - elRect.left;
      } else {
        minDx = boundsRect.left + padding - elRect.left;
        maxDx = boundsRect.right - padding - elRect.right;
      }

      let minDy: number;
      let maxDy: number;
      if (clampMode === 'header' || tallBox) {
        const effHandle = Math.min(handleHeight, elRect.height);
        minDy = boundsRect.top + padding - elRect.top;
        maxDy = boundsRect.bottom - padding - effHandle - elRect.top;
      } else {
        minDy = boundsRect.top + padding - elRect.top;
        maxDy = boundsRect.bottom - padding - elRect.bottom;
      }

      const safeMinDx = Math.min(minDx, maxDx);
      const safeMaxDx = Math.max(minDx, maxDx);
      const safeMinDy = Math.min(minDy, maxDy);
      const safeMaxDy = Math.max(minDy, maxDy);

      let hasMoved = false;

      const handleMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startClientX;
        const dy = moveEvent.clientY - startClientY;

        if (!hasMoved) {
          if (Math.hypot(dx, dy) < 4) return;
          hasMoved = true;
          setIsDragging(true);
        }

        moveEvent.preventDefault();
        const clampedDx = Math.max(safeMinDx, Math.min(safeMaxDx, dx));
        const clampedDy = Math.max(safeMinDy, Math.min(safeMaxDy, dy));
        setOffset({
          x: Math.round(curX + clampedDx),
          y: Math.round(curY + clampedDy),
        });
      };

      const finish = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        cleanupRef.current = null;

        if (hasMoved) {
          justDraggedRef.current = true;
          window.setTimeout(() => {
            justDraggedRef.current = false;
          }, 80);
        }
        setIsDragging(false);
      };

      cleanupRef.current?.();
      cleanupRef.current = finish;
      window.addEventListener('pointermove', handleMove, { passive: false });
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [boundsSelector, clampMode, disabled, handleHeight, minVisibleX, padding]
  );

  const wasJustDragged = useCallback(() => justDraggedRef.current, []);

  return {
    popupRef,
    offset,
    isDragging,
    resetPosition,
    wasJustDragged,
    handleProps: {
      onPointerDown,
      onDoubleClick: resetPosition,
      style: { touchAction: 'none' } as React.CSSProperties,
    },
    popupStyle: {
      transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
      willChange: isDragging ? 'transform' : undefined,
    } as React.CSSProperties,
  };
}
