import React, { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  snapPoints?: number[];
  initialSnap?: number;
}

const SNAP_POINTS = [0.4, 0.7, 0.95];
const DRAG_THRESHOLD = 80;

export function BottomSheet({
  isOpen,
  onClose,
  children,
  snapPoints = SNAP_POINTS,
  initialSnap = 1,
}: BottomSheetProps) {
  const [currentSnap, setCurrentSnap] = useState(initialSnap);
  const [dragY, setDragY] = useState<number | null>(null);
  const startYRef = useRef(0);
  const dragYRef = useRef(0);

  // Always reopen at the initial snap point.
  useEffect(() => {
    if (isOpen) setCurrentSnap(initialSnap);
  }, [isOpen, initialSnap]);

  const startDrag = (clientY: number) => {
    startYRef.current = clientY;
    dragYRef.current = 0;
    setDragY(0);
  };

  const moveDrag = (clientY: number) => {
    dragYRef.current = clientY - startYRef.current;
    setDragY(dragYRef.current);
  };

  const endDrag = () => {
    const delta = dragYRef.current;
    dragYRef.current = 0;
    setDragY(null);
    if (delta > DRAG_THRESHOLD) {
      // Drag down: shrink, or close from the lowest snap point.
      if (currentSnap === 0) onClose();
      else setCurrentSnap(currentSnap - 1);
    } else if (delta < -DRAG_THRESHOLD) {
      setCurrentSnap(Math.min(currentSnap + 1, snapPoints.length - 1));
    }
  };

  const isDragging = dragY !== null;

  // Mouse drags keep tracking even when the pointer leaves the handle.
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => moveDrag(e.clientY);
    const onUp = () => endDrag();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, currentSnap]);

  if (!isOpen) return null;

  const height = `${(snapPoints[currentSnap] ?? 0.7) * 100}vh`;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-200"
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          height,
          transform: `translateY(${Math.max(dragY ?? 0, 0)}px)`,
          transition: isDragging
            ? "none"
            : "transform 300ms ease-out, height 300ms ease-out",
        }}
      >
        {/* Only the header is draggable, so scrolling/selecting content works. */}
        <div
          className="flex items-center justify-between px-4 pt-3 pb-2 bg-white border-b border-gray-100 touch-none select-none"
          onTouchStart={(e) => startDrag(e.touches[0].clientY)}
          onTouchMove={(e) => moveDrag(e.touches[0].clientY)}
          onTouchEnd={endDrag}
          onMouseDown={(e) => startDrag(e.clientY)}
        >
          <div className="flex flex-col items-center flex-1">
            <div className="w-12 h-1 bg-gray-300 rounded-full cursor-grab active:cursor-grabbing" />
          </div>
          <button
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="p-2 -mr-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </>
  );
}
