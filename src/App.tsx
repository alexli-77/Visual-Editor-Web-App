import React, { useState, useCallback } from 'react';
import { TopBar } from './components/TopBar';
import { LeftToolPanel } from './components/LeftToolPanel';
import { Canvas } from './components/Canvas';
import { RightPropertiesPanel } from './components/RightPropertiesPanel';

export type Tool = 'select' | 'brush' | 'eraser' | 'rectangle' | 'circle' | 'triangle' | 'line' | 'polygon' | 'star' | 'merge';

export interface Transform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface CanvasObject {
  id: string;
  type: 'drawn' | 'rectangle' | 'circle' | 'triangle' | 'line' | 'polygon' | 'star' | 'merged' | 'image';
  transform: Transform;
  style: {
    strokeColor: string;
    fillColor: string;
    strokeWidth: number;
    opacity?: number;
  };
  data: any; // specific to object type
  children?: CanvasObject[]; // for merged objects
}

export interface HistoryState {
  objects: CanvasObject[];
}

export default function App() {
  const [currentTool, setCurrentTool] = useState<Tool>('select');
  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(100);
  const [history, setHistory] = useState<HistoryState[]>([{ objects: [] }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [eraserSize, setEraserSize] = useState(20);
  
  // Brush settings
  const [brushSize, setBrushSize] = useState(5);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushType, setBrushType] = useState<'normal' | 'spray' | 'marker'>('normal');
  const [brushOpacity, setBrushOpacity] = useState(1);

  const addToHistory = useCallback((newObjects: CanvasObject[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ objects: newObjects });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setObjects(history[historyIndex - 1].objects);
      setSelectedIds([]);
    }
  }, [historyIndex, history]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setObjects(history[historyIndex + 1].objects);
      setSelectedIds([]);
    }
  }, [historyIndex, history]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(200, prev + 10));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(50, prev - 10));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(100);
  }, []);

  const handleNew = useCallback(() => {
    setObjects([]);
    setSelectedIds([]);
    setHistory([{ objects: [] }]);
    setHistoryIndex(0);
  }, []);

  const updateObjects = useCallback((newObjects: CanvasObject[]) => {
    setObjects(newObjects);
    addToHistory(newObjects);
  }, [addToHistory]);

  const handleOpenImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // Calculate dimensions to fit within canvas while maintaining aspect ratio
        // Default max size 400x400
        const maxSize = 400;
        let width = img.width;
        let height = img.height;
        
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width *= ratio;
          height *= ratio;
        }

        const newObject: CanvasObject = {
          id: `image-${Date.now()}`,
          type: 'image',
          transform: {
            x: (1200 - width) / 2, // Center horizontally (assuming 1200 canvas width)
            y: (800 - height) / 2, // Center vertically (assuming 800 canvas height)
            width,
            height,
            rotation: 0
          },
          style: {
            strokeColor: 'transparent',
            fillColor: 'transparent',
            strokeWidth: 0,
            opacity: 1
          },
          data: {
            imageUrl,
            originalWidth: img.width,
            originalHeight: img.height,
            erasedAreas: []
          }
        };

        updateObjects([...objects, newObject]);
        setSelectedIds([newObject.id]);
      };
      img.src = imageUrl;
    };
    reader.readAsDataURL(file);
    
    // Reset input value so same file can be selected again
    e.target.value = '';
  }, [objects, updateObjects]);

  // Recursively update style for merged objects and all their children
  const updateObjectStyle = useCallback((obj: CanvasObject, styleUpdates: Partial<CanvasObject['style']>): CanvasObject => {
    const newStyle = { ...obj.style, ...styleUpdates };
    
    if (obj.type === 'merged' && obj.children) {
      // Recursively update all children
      const updatedChildren = obj.children.map(child => 
        updateObjectStyle(child, styleUpdates)
      );
      
      return {
        ...obj,
        style: newStyle,
        children: updatedChildren
      };
    }
    
    // For regular objects, just update the style
    return {
      ...obj,
      style: newStyle
    };
  }, []);

  const handleObjectUpdate = useCallback((updates: Partial<CanvasObject>) => {
    if (selectedIds.length !== 1) return;
    
    const newObjects = objects.map(obj => {
      if (obj.id === selectedIds[0]) {
        // If updating style and object is merged, recursively update children
        if (updates.style && obj.type === 'merged') {
          return updateObjectStyle(obj, updates.style);
        }
        // Otherwise, normal update
        return { ...obj, ...updates };
      }
      return obj;
    });
    
    updateObjects(newObjects);
  }, [objects, selectedIds, updateObjects, updateObjectStyle]);

  const handleMerge = useCallback(() => {
    if (selectedIds.length < 2) return;

    const selectedObjects = objects.filter(obj => selectedIds.includes(obj.id));
    const remainingObjects = objects.filter(obj => !selectedIds.includes(obj.id));

    // Calculate bounding box for merged object
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectedObjects.forEach(obj => {
      const { x, y, width, height } = obj.transform;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    });

    // Ensure merged object stays within canvas bounds
    const mergedWidth = maxX - minX;
    const mergedHeight = maxY - minY;
    const constrainedX = Math.max(0, Math.min(minX, 1200 - mergedWidth));
    const constrainedY = Math.max(0, Math.min(minY, 800 - mergedHeight));

    const mergedObject: CanvasObject = {
      id: `merged-${Date.now()}`,
      type: 'merged',
      transform: {
        x: constrainedX,
        y: constrainedY,
        width: mergedWidth,
        height: mergedHeight,
        rotation: 0
      },
      style: {
        strokeColor: '#000000',
        fillColor: 'transparent',
        strokeWidth: 2
      },
      data: {
        originalWidth: mergedWidth,
        originalHeight: mergedHeight
      },
      children: selectedObjects.map(obj => {
        // Convert transform to relative coordinates
        const relativeTransform = {
          ...obj.transform,
          x: obj.transform.x - constrainedX,
          y: obj.transform.y - constrainedY
        };

        // For drawn objects, also convert path points to relative coordinates
        if (obj.type === 'drawn' && obj.data.path) {
          const relativePath = (obj.data.path as { x: number; y: number }[]).map(point => ({
            x: point.x - constrainedX,
            y: point.y - constrainedY
          }));

          return {
            ...obj,
            transform: relativeTransform,
            data: {
              ...obj.data,
              path: relativePath
            }
          };
        }

        // For other object types, just convert transform
        return {
          ...obj,
          transform: relativeTransform
        };
      })
    };

    const newObjects = [...remainingObjects, mergedObject];
    updateObjects(newObjects);
    setSelectedIds([mergedObject.id]);
  }, [objects, selectedIds, updateObjects]);

  const handleDelete = useCallback(() => {
    if (selectedIds.length === 0) return;
    
    const newObjects = objects.filter(obj => !selectedIds.includes(obj.id));
    updateObjects(newObjects);
    setSelectedIds([]);
  }, [objects, selectedIds, updateObjects]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        // Don't delete if user is typing in an input
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
          return;
        }
        handleDelete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, handleDelete]);

  const selectedObject = selectedIds.length === 1 
    ? objects.find(obj => obj.id === selectedIds[0]) 
    : null;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <TopBar
        onNew={handleNew}
        onOpen={handleOpenImage}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        zoom={zoom}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
      />
      
      <div className="flex flex-1 overflow-hidden">
        <LeftToolPanel
          currentTool={currentTool}
          onToolChange={setCurrentTool}
        />
        
        <div className="flex-1 overflow-auto">
          <Canvas
            currentTool={currentTool}
            objects={objects}
            selectedIds={selectedIds}
            zoom={zoom}
            eraserSize={eraserSize}
            brushSize={brushSize}
            brushColor={brushColor}
            brushType={brushType}
            brushOpacity={brushOpacity}
            onObjectsChange={updateObjects}
            onSelectedIdsChange={setSelectedIds}
          />
        </div>
        
        <div className="w-64 border-l border-gray-200 bg-white overflow-auto">
          <RightPropertiesPanel
            currentTool={currentTool}
            selectedObject={selectedObject}
            selectedCount={selectedIds.length}
            eraserSize={eraserSize}
            onEraserSizeChange={setEraserSize}
            onObjectUpdate={handleObjectUpdate}
            onMerge={handleMerge}
            onDelete={handleDelete}
            brushSize={brushSize}
            onBrushSizeChange={setBrushSize}
            brushColor={brushColor}
            onBrushColorChange={setBrushColor}
            brushType={brushType}
            onBrushTypeChange={setBrushType}
            brushOpacity={brushOpacity}
            onBrushOpacityChange={setBrushOpacity}
          />
        </div>
      </div>

      <div className="px-4 py-2 bg-white border-t border-gray-200 text-xs text-gray-500">
        Canvas rendered via React components • CanvasObject, SelectionBox, ToolsBar, PropertiesPanel
      </div>
    </div>
  );
}