import React, { useState, useRef, useCallback, useEffect } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  snapPoints?: number[];
  initialSnap?: number;
  maxHeight?: string;
}

const SNAP_POINTS = [0.4, 0.7, 0.95];

export function BottomSheet({
  isOpen,
  onClose,
  children,
  snapPoints = SNAP_POINTS,
  initialSnap = 1,
  maxHeight = "85vh",
}: BottomSheetProps) {
  const [currentSnap, setCurrentSnap] = useState(initialSnap);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getSheetTranslate = useCallback(
    (snapIndex: number) => {
      return snapPoints[snapIndex];
    },
    [snapPoints],
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    setStartY(touch.clientY);
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const deltaY = touch.clientY - startY;
      setCurrentY(deltaY);
    },
    [isDragging, startY],
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    console.log(currentY);

    const threshold = 80;
    if (currentY > threshold && currentSnap < snapPoints.length - 1) {
      setCurrentSnap((prev) => Math.min(prev + 1, snapPoints.length - 1));
    } else if (currentY < -threshold && currentSnap > 0) {
      setCurrentSnap((prev) => Math.max(prev - 1, 0));
    }
    setCurrentY(0);
  }, [isDragging, currentY, currentSnap, snapPoints]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setStartY(e.clientY);
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const deltaY = e.clientY - startY;
      setCurrentY(deltaY);
    },
    [isDragging, startY],
  );

  const handleMouseUp = useCallback(() => {
    handleTouchEnd();
  }, [handleTouchEnd]);

  useEffect(() => {
    if (!isDragging) {
      setCurrentY(0);
    }
  }, [isDragging]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setCurrentY(0);
      }
    };

    if (isDragging) {
      window.addEventListener("mouseup", handleGlobalMouseUp);
      window.addEventListener("mousemove", handleMouseMove as any);
    }

    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("mousemove", handleMouseMove as any);
    };
  }, [isDragging, handleMouseMove]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-200"
        onClick={onClose}
      />
      <div
        ref={containerRef}
        className="fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-out"
        style={{
          height: maxHeight,
          transform: `translateY(${-getSheetTranslate(currentSnap) * 0}%)`,
          maxHeight,
        }}
      >
        <div
          ref={sheetRef}
          className="bg-white rounded-t-2xl shadow-2xl overflow-hidden"
          style={{
            height: maxHeight,
            transform: `translateY(${isDragging ? currentY : 0}px)`,
            transition: isDragging ? "none" : "transform 300ms ease-out",
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 pt-3 pb-2 bg-white border-b border-gray-100">
              <div className="flex flex-col items-center flex-1">
                <div className="w-12 h-1 bg-gray-300 rounded-full cursor-grab active:cursor-grabbing" />
              </div>
              <button
                onClick={onClose}
                className="p-2 -mr-2 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          </div>
        </div>
      </div>
    </>
  );
}
