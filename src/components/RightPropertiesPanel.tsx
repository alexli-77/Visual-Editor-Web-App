import React from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import { Separator } from './ui/separator';
import { Layers, Trash2 } from 'lucide-react';
import type { CanvasObject, Tool } from '../App';

interface RightPropertiesPanelProps {
  currentTool: Tool;
  selectedObject: CanvasObject | null;
  selectedCount: number;
  eraserSize: number;
  onEraserSizeChange: (size: number) => void;
  onObjectUpdate: (updates: Partial<CanvasObject>) => void;
  onMerge: () => void;
  onDelete: () => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  brushColor: string;
  onBrushColorChange: (color: string) => void;
  brushType: 'normal' | 'spray' | 'marker';
  onBrushTypeChange: (type: 'normal' | 'spray' | 'marker') => void;
  brushOpacity: number;
  onBrushOpacityChange: (opacity: number) => void;
}

export function RightPropertiesPanel({
  currentTool,
  selectedObject,
  selectedCount,
  eraserSize,
  onEraserSizeChange,
  onObjectUpdate,
  onMerge,
  onDelete,
  brushSize,
  onBrushSizeChange,
  brushColor,
  onBrushColorChange,
  brushType,
  onBrushTypeChange,
  brushOpacity,
  onBrushOpacityChange
}: RightPropertiesPanelProps) {
  const getObjectTypeName = (obj: CanvasObject | null) => {
    if (!obj) return '';
    switch (obj.type) {
      case 'drawn': return 'Drawn Object';
      case 'rectangle': return 'Rectangle';
      case 'circle': return 'Circle';
      case 'triangle': return 'Triangle';
      case 'polygon': return 'Polygon';
      case 'star': return 'Star';
      case 'line': return 'Line';
      case 'merged': return 'Merged Object';
      case 'image': return 'Image';
      default: return 'Object';
    }
  };

  return (
    <div className="w-72 bg-white border-l border-gray-200 p-4 overflow-y-auto">
      <h2 className="text-gray-900 mb-4">Properties</h2>

      {currentTool === 'brush' && (
        <div className="space-y-4">
          <div>
            <Label>Brush Size</Label>
            <Slider
              value={[brushSize]}
              onValueChange={([value]) => onBrushSizeChange(value)}
              min={1}
              max={50}
              step={1}
              className="mt-2"
            />
            <div className="text-xs text-gray-500 mt-1">{brushSize}px</div>
          </div>

          <div>
            <Label>Brush Opacity</Label>
            <Slider
              value={[brushOpacity * 100]}
              onValueChange={([value]) => onBrushOpacityChange(value / 100)}
              min={1}
              max={100}
              step={1}
              className="mt-2"
            />
            <div className="text-xs text-gray-500 mt-1">{Math.round(brushOpacity * 100)}%</div>
          </div>

          <div>
            <Label className="text-xs">Brush Color</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="color"
                value={brushColor}
                onChange={(e) => onBrushColorChange(e.target.value)}
                className="w-16 h-9"
              />
              <Input
                type="text"
                value={brushColor}
                onChange={(e) => onBrushColorChange(e.target.value)}
                className="flex-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Brush Type</Label>
            <select
              value={brushType}
              onChange={(e) => onBrushTypeChange(e.target.value as 'normal' | 'spray' | 'marker')}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="normal">Normal</option>
              <option value="spray">Spray</option>
              <option value="marker">Marker</option>
            </select>
          </div>

          <div className="text-xs text-gray-600 bg-blue-50 p-3 rounded border border-blue-200">
            <p><strong>Normal:</strong> Standard brush stroke</p>
            <p className="mt-1"><strong>Spray:</strong> Paint spray effect with particle dispersion</p>
            <p className="mt-1"><strong>Marker:</strong> Semi-transparent with blending</p>
          </div>

          <Separator />
        </div>
      )}

      {currentTool === 'eraser' && (
        <div className="space-y-4">
          <div>
            <Label>Eraser Size</Label>
            <Slider
              value={[eraserSize]}
              onValueChange={([value]) => onEraserSizeChange(value)}
              min={5}
              max={100}
              step={5}
              className="mt-2"
            />
            <div className="text-xs text-gray-500 mt-1">{eraserSize}px</div>
          </div>
          <div className="text-xs text-gray-600 bg-blue-50 p-3 rounded border border-blue-200">
            <p>Eraser removes parts of objects, but remaining parts stay selectable.</p>
          </div>
          <Separator />
          <div className="text-[10px] text-gray-400">
            PropertiesPanel component
          </div>
        </div>
      )}

      {currentTool === 'merge' && (
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            <p className="mb-2">Selected objects: {selectedCount}</p>
            <p className="text-xs text-gray-500 mb-3">
              Use Ctrl+Click to select multiple objects, then merge them into one.
            </p>
          </div>
          
          {selectedCount >= 2 && (
            <Button 
              onClick={onMerge}
              className="w-full"
            >
              <Layers className="size-4 mr-2" />
              Merge Objects
            </Button>
          )}

          {selectedCount > 0 && (
            <Button 
              variant="destructive"
              onClick={onDelete}
              className="w-full mt-2"
            >
              <Trash2 className="size-4 mr-2" />
              Delete Selected ({selectedCount})
            </Button>
          )}

          <div className="text-xs text-gray-600 bg-green-50 p-3 rounded border border-green-200">
            <p>Merged objects behave as a single object and can be moved, rotated, scaled, and erased together.</p>
          </div>
        </div>
      )}

      {selectedObject && currentTool !== 'eraser' && currentTool !== 'merge' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs text-gray-500">Object Type</Label>
              <div className="mt-1 font-medium">{getObjectTypeName(selectedObject)}</div>
            </div>
            <Button variant="destructive" size="icon" onClick={onDelete} title="Delete Object (Del)">
              <Trash2 className="size-4" />
            </Button>
          </div>
          {selectedObject.id && (
            <div className="text-xs text-gray-400 mt-1">ID: {selectedObject.id.substring(0, 12)}...</div>
          )}

          <Separator />

          <div>
            <Label className="mb-3 block">Transform</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">X Position</Label>
                <Input
                  type="number"
                  value={Math.round(selectedObject.transform.x)}
                  onChange={(e) => onObjectUpdate({
                    transform: { ...selectedObject.transform, x: Number(e.target.value) }
                  })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Y Position</Label>
                <Input
                  type="number"
                  value={Math.round(selectedObject.transform.y)}
                  onChange={(e) => onObjectUpdate({
                    transform: { ...selectedObject.transform, y: Number(e.target.value) }
                  })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Width</Label>
                <Input
                  type="number"
                  value={Math.round(selectedObject.transform.width)}
                  onChange={(e) => onObjectUpdate({
                    transform: { ...selectedObject.transform, width: Math.max(10, Number(e.target.value)) }
                  })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Height</Label>
                <Input
                  type="number"
                  value={Math.round(selectedObject.transform.height)}
                  onChange={(e) => onObjectUpdate({
                    transform: { ...selectedObject.transform, height: Math.max(10, Number(e.target.value)) }
                  })}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs">Rotation (degrees)</Label>
            <Input
              type="number"
              value={Math.round(selectedObject.transform.rotation)}
              onChange={(e) => onObjectUpdate({
                transform: { ...selectedObject.transform, rotation: Number(e.target.value) }
              })}
              className="mt-1"
            />
          </div>

          <Separator />

          {selectedObject.type !== 'line' && selectedObject.type !== 'image' && (
            <>
              <div>
                <Label className="text-xs">Fill Color</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="color"
                    value={selectedObject.style.fillColor === 'transparent' ? '#ffffff' : selectedObject.style.fillColor}
                    onChange={(e) => onObjectUpdate({
                      style: { ...selectedObject.style, fillColor: e.target.value }
                    })}
                    className="w-16 h-9"
                  />
                  <Input
                    type="text"
                    value={selectedObject.style.fillColor}
                    onChange={(e) => onObjectUpdate({
                      style: { ...selectedObject.style, fillColor: e.target.value }
                    })}
                    className="flex-1"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <Label className="text-xs">Stroke Color</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="color"
                value={selectedObject.style.strokeColor}
                onChange={(e) => onObjectUpdate({
                  style: { ...selectedObject.style, strokeColor: e.target.value }
                })}
                className="w-16 h-9"
                disabled={selectedObject.type === 'image'}
              />
              <Input
                type="text"
                value={selectedObject.style.strokeColor}
                onChange={(e) => onObjectUpdate({
                  style: { ...selectedObject.style, strokeColor: e.target.value }
                })}
                className="flex-1"
                disabled={selectedObject.type === 'image'}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Stroke Width</Label>
            <Input
              type="number"
              value={selectedObject.style.strokeWidth}
              onChange={(e) => onObjectUpdate({
                style: { ...selectedObject.style, strokeWidth: Math.max(0, Number(e.target.value)) }
              })}
              className="mt-1"
              disabled={selectedObject.type === 'image'}
            />
          </div>

          <div>
            <Label className="text-xs">Opacity</Label>
            <Slider
              value={[(selectedObject.style.opacity ?? 1) * 100]}
              onValueChange={([value]) => onObjectUpdate({
                style: { ...selectedObject.style, opacity: value / 100 }
              })}
              min={1}
              max={100}
              step={1}
              className="mt-2"
            />
            <div className="text-xs text-gray-500 mt-1">{Math.round((selectedObject.style.opacity ?? 1) * 100)}%</div>
          </div>

          <div className="text-xs text-gray-600 bg-purple-50 p-3 rounded border border-purple-200 mt-4">
            <p>Free-drawn strokes become selectable objects.</p>
          </div>
        </div>
      )}

      {!selectedObject && currentTool !== 'eraser' && currentTool !== 'merge' && (
        <div className="text-sm text-gray-400 text-center py-8">
          Select an object to view properties
        </div>
      )}

      <div className="text-[10px] text-gray-400 mt-6 pt-4 border-t border-gray-200">
        PropertiesPanel component
      </div>
    </div>
  );
}