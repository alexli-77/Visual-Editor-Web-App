import React from 'react';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Undo2, Redo2, Plus, Minus, FolderOpen, Save, Download } from 'lucide-react';

interface TopBarProps {
  onNew: () => void;
  onOpen: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
}

export function TopBar({
  onNew,
  onOpen,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  zoom,
  canUndo,
  canRedo
}: TopBarProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        <h1 className="text-gray-900">ShapeCanvas Editor</h1>
        <span className="text-xs text-gray-400">Built with React components</span>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={onOpen}
          accept="image/*"
          style={{ display: 'none' }}
        />
        <Button variant="outline" size="sm" onClick={onNew}>
          New
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          <FolderOpen className="size-4 mr-1" />
          Open
        </Button>
        <Button variant="outline" size="sm">
          <Save className="size-4 mr-1" />
          Save
        </Button>
        <Button variant="outline" size="sm">
          <Download className="size-4 mr-1" />
          Export
        </Button>

        <Separator orientation="vertical" className="h-8 mx-2" />

        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onZoomOut}
            disabled={zoom <= 50}
          >
            <Minus className="size-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onResetZoom}
            className="min-w-16"
          >
            {zoom}%
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onZoomIn}
            disabled={zoom >= 200}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-8 mx-2" />

        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onUndo}
          disabled={!canUndo}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onRedo}
          disabled={!canRedo}
        >
          <Redo2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
