import React from 'react';
import { MousePointer2, Paintbrush, Eraser, Square, Circle, Triangle, Minus, Hexagon, Star, Layers } from 'lucide-react';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import type { Tool } from '../App';

interface LeftToolPanelProps {
  currentTool: Tool;
  onToolChange: (tool: Tool) => void;
}

export function LeftToolPanel({ currentTool, onToolChange }: LeftToolPanelProps) {
  const tools = [
    { id: 'select' as Tool, icon: MousePointer2, label: 'Select / Move Tool' },
    { id: 'brush' as Tool, icon: Paintbrush, label: 'Brush / Free Draw Tool' },
    { id: 'eraser' as Tool, icon: Eraser, label: 'Eraser Tool' },
  ];

  const shapeTools = [
    { id: 'rectangle' as Tool, icon: Square, label: 'Rectangle' },
    { id: 'circle' as Tool, icon: Circle, label: 'Circle' },
    { id: 'triangle' as Tool, icon: Triangle, label: 'Triangle' },
    { id: 'polygon' as Tool, icon: Hexagon, label: 'Polygon' },
    { id: 'star' as Tool, icon: Star, label: 'Star' },
    { id: 'line' as Tool, icon: Minus, label: 'Line' },
  ];

  const getCurrentShapeTool = () => {
    const shapeTool = shapeTools.find(s => s.id === currentTool);
    return shapeTool || shapeTools[0];
  };

  const isShapeTool = ['rectangle', 'circle', 'triangle', 'polygon', 'star', 'line'].includes(currentTool);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-20 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-2">
        {tools.map(tool => (
          <Tooltip key={tool.id}>
            <TooltipTrigger asChild>
              <div>
                <Button
                  variant={currentTool === tool.id ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => onToolChange(tool.id)}
                  className="w-14 h-14"
                >
                  <tool.icon className="size-5" />
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{tool.label}</p>
            </TooltipContent>
          </Tooltip>
        ))}

        <Separator className="w-12 my-2" />

        {/* Shape Tools Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={isShapeTool ? 'default' : 'ghost'}
              size="icon"
              className="w-14 h-14"
              title="Shape Tools - Click to select shape"
            >
              {React.createElement(getCurrentShapeTool().icon, { className: 'size-5' })}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right">
            <div className="px-2 py-1.5 text-xs text-gray-500 border-b">
              Select a shape to insert
            </div>
            {shapeTools.map(shape => (
              <DropdownMenuItem
                key={shape.id}
                onClick={() => onToolChange(shape.id)}
                className="flex items-center gap-2"
              >
                <shape.icon className="size-4" />
                <span>{shape.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator className="w-12 my-2" />

        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                variant={currentTool === 'merge' ? 'default' : 'ghost'}
                size="icon"
                onClick={() => onToolChange('merge')}
                className="w-14 h-14"
              >
                <Layers className="size-5" />
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Merge / Group Tool</p>
          </TooltipContent>
        </Tooltip>

        <div className="mt-auto text-[10px] text-center text-gray-400 px-2 leading-tight">
          Tools<br/>Panel
        </div>
      </div>
    </TooltipProvider>
  );
}