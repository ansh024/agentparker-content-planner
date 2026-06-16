import { useState, useCallback, useRef } from "react";

/**
 * Touch-enabled drag-to-reorder hook.
 * Works with both mouse and touch events.
 *
 * Usage:
 *   const { draggedId, handleDragStart, handleDragOver, handleDrop } = useTouchDrag(onReorder);
 */

export function useTouchDrag(onReorder) {
  const [draggedId, setDraggedId] = useState(null);
  const dragImage = useRef(null);

  const handleDragStart = useCallback((e, id) => {
    setDraggedId(id);
    // Set a small invisible drag image for cleaner UX
    if (e.dataTransfer) {
      const img = new Image();
      img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=";
      e.dataTransfer.setDragImage(img, 0, 0);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e, targetDate) => {
      e.preventDefault();
      const ideaId = e.dataTransfer.getData("text/plain") || draggedId;
      setDraggedId(null);
      if (ideaId && targetDate && onReorder) {
        onReorder(ideaId, targetDate);
      }
    },
    [draggedId, onReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
  }, []);

  return {
    draggedId,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}
