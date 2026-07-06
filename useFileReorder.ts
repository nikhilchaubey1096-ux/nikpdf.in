import React, { useState, useCallback } from "react";

export interface UseFileReorderReturn {
  draggedIndex: number | null;
  dragOverIndex: number | null;
  dropPosition: "above" | "below" | null;
  handleDragStart: (e: React.DragEvent, index: number) => void;
  handleDragOver: (e: React.DragEvent, index: number) => void;
  handleDrop: (e: React.DragEvent, index: number) => void;
  handleDragEnd: () => void;
}

export function useFileReorder<T>(
  items: T[],
  onItemsChange: (items: T[]) => void
): UseFileReorderReturn {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<"above" | "below" | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    
    // Set a clean dataTransfer effect for browser compatibility
    try {
      e.dataTransfer.setData("text/plain", index.toString());
    } catch (err) {
      // Ignored for older/stricter environments
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const halfway = rect.height / 2;
    const position = relativeY < halfway ? "above" : "below";

    setDragOverIndex(index);
    setDropPosition(position);
  }, [draggedIndex]);

  const handleDrop = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    let targetIndex = index;
    if (dropPosition === "below") {
      if (draggedIndex < index) {
        targetIndex = index;
      } else {
        targetIndex = index + 1;
      }
    } else { // "above"
      if (draggedIndex > index) {
        targetIndex = index;
      } else {
        targetIndex = index - 1;
      }
    }

    // Bound checks
    targetIndex = Math.max(0, Math.min(items.length - 1, targetIndex));

    if (draggedIndex !== targetIndex) {
      const newItems = [...items];
      const [draggedItem] = newItems.splice(draggedIndex, 1);
      newItems.splice(targetIndex, 0, draggedItem);
      onItemsChange(newItems);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
    setDropPosition(null);
  }, [draggedIndex, dropPosition, items, onItemsChange]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setDropPosition(null);
  }, []);

  return {
    draggedIndex,
    dragOverIndex,
    dropPosition,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}
