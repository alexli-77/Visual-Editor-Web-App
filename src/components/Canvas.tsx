import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { CanvasObject, Tool } from '../App';

interface CanvasProps {
  currentTool: Tool;
  objects: CanvasObject[];
  selectedIds: string[];
  zoom: number;
  eraserSize: number;
  onObjectsChange: (objects: CanvasObject[]) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  brushSize?: number;
  brushColor?: string;
  brushType?: 'normal' | 'spray' | 'marker';
  brushOpacity?: number;
}

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;

// Generate spray particles for a path (called once when creating the object)
const generateSprayParticles = (
  path: { x: number; y: number }[],
  strokeWidth: number,
  objectX: number,
  objectY: number
): { x: number; y: number; size: number; alpha: number }[] => {
  const particles: { x: number; y: number; size: number; alpha: number }[] = [];
  const particleDensity = Math.max(1, Math.floor(strokeWidth / 2));
  
  for (let i = 0; i < path.length - 1; i++) {
    const x1 = path[i].x - objectX;
    const y1 = path[i].y - objectY;
    const x2 = path[i + 1].x - objectX;
    const y2 = path[i + 1].y - objectY;
    const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const particleCount = Math.max(particleDensity, Math.floor(dist / 2));
    
    for (let j = 0; j < particleCount; j++) {
      const t = j / particleCount;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      const spread = strokeWidth * 1.5;
      const offsetX = (Math.random() - 0.5) * spread;
      const offsetY = (Math.random() - 0.5) * spread;
      const size = Math.random() * (strokeWidth / 3) + 1;
      const alpha = Math.random() * 0.5 + 0.3;
      
      particles.push({
        x: px + offsetX,
        y: py + offsetY,
        size,
        alpha
      });
    }
  }
  
  return particles;
};

export function Canvas({
  currentTool,
  objects,
  selectedIds,
  zoom,
  eraserSize,
  brushSize,
  brushColor,
  brushType,
  brushOpacity,
  onObjectsChange,
  onSelectedIdsChange
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [rotateStart, setRotateStart] = useState<{ x: number; y: number } | null>(null);
  const [initialRotation, setInitialRotation] = useState(0);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<{ x: number; y: number } | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null); // Track mouse for custom cursor
  const [shapeStart, setShapeStart] = useState<{ x: number; y: number } | null>(null);
  const [shapeCurrent, setShapeCurrent] = useState<{ x: number; y: number } | null>(null);
  const [, setForceUpdate] = useState(0); // To force re-render when images load
  
  // Cache for loaded images
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }, []);

  const constrainToCanvas = useCallback((x: number, y: number, width: number, height: number) => {
    return {
      x: Math.max(0, Math.min(x, CANVAS_WIDTH - width)),
      y: Math.max(0, Math.min(y, CANVAS_HEIGHT - height)),
      width: Math.min(width, CANVAS_WIDTH),
      height: Math.min(height, CANVAS_HEIGHT)
    };
  }, []);

  const isPointInObject = useCallback((x: number, y: number, obj: CanvasObject): boolean => {
    const { x: ox, y: oy, width, height, rotation } = obj.transform;
    
    // For drawn objects, check if point is near the path
    if (obj.type === 'drawn' && obj.data.path) {
      const path = obj.data.path as { x: number; y: number }[];
      const threshold = 15; // pixels threshold for selecting drawn paths
      
      // Check distance to each line segment in the path
      for (let i = 0; i < path.length - 1; i++) {
        const x1 = path[i].x;
        const y1 = path[i].y;
        const x2 = path[i + 1].x;
        const y2 = path[i + 1].y;
        
        // Calculate distance from point to line segment
        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
          param = dot / lenSq;
        }
        
        let xx, yy;
        
        if (param < 0) {
          xx = x1;
          yy = y1;
        } else if (param > 1) {
          xx = x2;
          yy = y2;
        } else {
          xx = x1 + param * C;
          yy = y1 + param * D;
        }
        
        const dx = x - xx;
        const dy = y - yy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < threshold) {
          return true;
        }
      }
      
      // Also check bounding box as fallback
      return x >= ox && x <= ox + width && y >= oy && y <= oy + height;
    }
    
    // For other objects, simple bounding box check
    if (rotation === 0) {
      return x >= ox && x <= ox + width && y >= oy && y <= oy + height;
    }
    
    // For rotated objects, transform point to object space
    const centerX = ox + width / 2;
    const centerY = oy + height / 2;
    const rad = -(rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = x - centerX;
    const dy = y - centerY;
    const rotatedX = dx * cos - dy * sin + centerX;
    const rotatedY = dx * sin + dy * cos + centerY;
    
    return rotatedX >= ox && rotatedX <= ox + width && rotatedY >= oy && rotatedY <= oy + height;
  }, []);

  // Transform point from canvas space to object's local rotated space
  const transformPointToObjectSpace = useCallback((x: number, y: number, obj: CanvasObject) => {
    const { x: ox, y: oy, width, height, rotation } = obj.transform;
    const centerX = ox + width / 2;
    const centerY = oy + height / 2;
    
    // Translate to origin
    const dx = x - centerX;
    const dy = y - centerY;
    
    // Rotate
    const rad = -(rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rotatedX = dx * cos - dy * sin;
    const rotatedY = dx * sin + dy * cos;
    
    // Translate back relative to top-left
    return {
      x: rotatedX + width / 2,
      y: rotatedY + height / 2
    };
  }, []);

  // Recursive function to apply eraser to an object (including nested merged objects)
  const applyEraserToObject = useCallback((
    obj: CanvasObject, 
    currentPath: { x: number; y: number }[], 
    currentPos: { x: number; y: number },
    eraserSize: number,
    parentTransform?: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }
  ): CanvasObject => {
    // Handle merged objects - recursively erase children
    if (obj.type === 'merged' && obj.children) {
      const { x, y, width, height, rotation } = obj.transform;
      const originalWidth = obj.data.originalWidth || width;
      const originalHeight = obj.data.originalHeight || height;
      const scaleX = width / originalWidth;
      const scaleY = height / originalHeight;
      
      // Calculate absolute transform considering parent
      let absX = x, absY = y, absRotation = rotation, absScaleX = scaleX, absScaleY = scaleY;
      
      if (parentTransform) {
        // Apply parent's scale to this object's position
        absX = parentTransform.x + x * parentTransform.scaleX;
        absY = parentTransform.y + y * parentTransform.scaleY;
        absRotation = parentTransform.rotation + rotation;
        absScaleX = parentTransform.scaleX * scaleX;
        absScaleY = parentTransform.scaleY * scaleY;
      }
      
      // Check if eraser is over this merged object
      const centerX = absX + width / 2;
      const centerY = absY + height / 2;
      const dx = currentPos.x - centerX;
      const dy = currentPos.y - centerY;
      const rad = -(absRotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rotatedX = dx * cos - dy * sin;
      const rotatedY = dx * sin + dy * cos;
      
      // Apply inverse scale to get position in original coordinate space
      const localX = (rotatedX / absScaleX) + originalWidth / 2;
      const localY = (rotatedY / absScaleY) + originalHeight / 2;
      
      // Recursively erase children
      const newChildren = obj.children.map(child => {
        const { x: cx, y: cy, width: cw, height: ch } = child.transform;
        
        // Check if eraser is over this child (in local coordinates)
        if (localX >= cx && localX <= cx + cw && localY >= cy && localY <= cy + ch) {
          // Recursively apply eraser (in case child is also a merged object)
          return applyEraserToObject(
            child,
            currentPath,
            currentPos,
            eraserSize,
            {
              x: absX,
              y: absY,
              rotation: absRotation,
              scaleX: absScaleX,
              scaleY: absScaleY
            }
          );
        }
        return child;
      });
      
      return {
        ...obj,
        children: newChildren
      };
    }
    
    // Handle regular objects (drawn, rectangle, circle, etc.)
    const erasedAreas = obj.data.erasedAreas || [];
    
    // Calculate local coordinates considering parent transform
    let localPath: { x: number; y: number; size: number }[];
    
    if (parentTransform) {
      // Transform each point in the path to this object's local space
      const { x: px, y: py, rotation: prot, scaleX: psx, scaleY: psy } = parentTransform;
      const { x: ox, y: oy, width: ow, height: oh } = obj.transform;
      
      const centerX = px + (ox + ow / 2) * psx;
      const centerY = py + (oy + oh / 2) * psy;
      const rad = -(prot * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      
      localPath = currentPath.map(p => {
        const dx = p.x - centerX;
        const dy = p.y - centerY;
        const rotatedX = dx * cos - dy * sin;
        const rotatedY = dx * sin + dy * cos;
        const localX = (rotatedX / psx) + ow / 2;
        const localY = (rotatedY / psy) + oh / 2;
        
        return {
          x: localX / ow,
          y: localY / oh,
          size: eraserSize / Math.min(ow, oh) / psx
        };
      });
      
      // Add current position
      const dx = currentPos.x - centerX;
      const dy = currentPos.y - centerY;
      const rotatedX = dx * cos - dy * sin;
      const rotatedY = dx * sin + dy * cos;
      const localX = (rotatedX / psx) + ow / 2;
      const localY = (rotatedY / psy) + oh / 2;
      
      localPath.push({
        x: localX / ow,
        y: localY / oh,
        size: eraserSize / Math.min(ow, oh) / psx
      });
    } else {
      // No parent transform, use simple calculation
      const { x, y, width, height } = obj.transform;
      localPath = currentPath.map(p => ({
        x: (p.x - x) / width,
        y: (p.y - y) / height,
        size: eraserSize / Math.min(width, height)
      }));
      
      localPath.push({
        x: (currentPos.x - x) / width,
        y: (currentPos.y - y) / height,
        size: eraserSize / Math.min(width, height)
      });
    }
    
    return {
      ...obj,
      data: {
        ...obj.data,
        erasedAreas: [...erasedAreas, localPath]
      }
    };
  }, []);

  const drawObject = useCallback((ctx: CanvasRenderingContext2D, obj: CanvasObject) => {
    const { x, y, width, height, rotation } = obj.transform;
    const { strokeColor, fillColor, strokeWidth, opacity } = obj.style;

    // Handle merged objects - draw children in parent's coordinate space
    if (obj.type === 'merged' && obj.children) {
      ctx.save();
      ctx.globalAlpha = opacity ?? 1;
      
      // Calculate scale based on current size vs original size
      const originalWidth = obj.data.originalWidth || width;
      const originalHeight = obj.data.originalHeight || height;
      const scaleX = width / originalWidth;
      const scaleY = height / originalHeight;
      
      // Apply parent's transform: translate -> rotate -> scale
      ctx.translate(x + width / 2, y + height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-originalWidth / 2, -originalHeight / 2);
      
      // Draw each child with relative coordinates (in original scale)
      obj.children.forEach(child => {
        drawObject(ctx, child);
      });
      
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-width / 2, -height / 2);

    // Create a temporary canvas for this object to handle erasing
    if (obj.data.erasedAreas && obj.data.erasedAreas.length > 0) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width + 20;
      tempCanvas.height = height + 20;
      const tempCtx = tempCanvas.getContext('2d');
      
      if (tempCtx) {
        tempCtx.translate(10, 10);
        
        // Draw the object on temp canvas
        tempCtx.strokeStyle = strokeColor;
        tempCtx.fillStyle = fillColor;
        tempCtx.lineWidth = strokeWidth;
        tempCtx.lineCap = 'round';
        tempCtx.lineJoin = 'round';

        if (obj.type === 'drawn' && obj.data.path) {
          const path = obj.data.path as { x: number; y: number }[];
          const brushType = obj.data.brushType || 'normal';
          
          if (brushType === 'spray' && obj.data.sprayParticles) {
            // Spray effect: use pre-generated particles (NO random generation!)
            tempCtx.fillStyle = strokeColor;
            const particles = obj.data.sprayParticles as { x: number; y: number; size: number; alpha: number }[];
            
            particles.forEach(particle => {
              tempCtx.globalAlpha = particle.alpha;
              tempCtx.beginPath();
              tempCtx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
              tempCtx.fill();
            });
            tempCtx.globalAlpha = 1;
          } else if (brushType === 'marker') {
            // Marker effect: semi-transparent smooth stroke
            tempCtx.globalAlpha = 0.6;
            tempCtx.beginPath();
            if (path.length > 0) {
              const firstPoint = path[0];
              tempCtx.moveTo(firstPoint.x - x, firstPoint.y - y);
              for (let i = 1; i < path.length; i++) {
                tempCtx.lineTo(path[i].x - x, path[i].y - y);
              }
              tempCtx.stroke();
            }
            tempCtx.globalAlpha = 1;
          } else {
            // Normal brush: regular stroke
            tempCtx.beginPath();
            if (path.length > 0) {
              const firstPoint = path[0];
              tempCtx.moveTo(firstPoint.x - x, firstPoint.y - y);
              for (let i = 1; i < path.length; i++) {
                tempCtx.lineTo(path[i].x - x, path[i].y - y);
              }
              tempCtx.stroke();
            }
          }
        } else if (obj.type === 'rectangle') {
          if (fillColor !== 'transparent') {
            tempCtx.fillRect(0, 0, width, height);
          }
          tempCtx.strokeRect(0, 0, width, height);
        } else if (obj.type === 'image') {
          const imageUrl = obj.data.imageUrl;
          const img = imageCache.current.get(imageUrl);
          if (img && img.complete && img.naturalWidth > 0) {
            tempCtx.drawImage(img, 0, 0, width, height);
          }
        } else if (obj.type === 'circle') {
          tempCtx.beginPath();
          tempCtx.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
          if (fillColor !== 'transparent') {
            tempCtx.fill();
          }
          tempCtx.stroke();
        } else if (obj.type === 'triangle') {
          tempCtx.beginPath();
          tempCtx.moveTo(width / 2, 0);
          tempCtx.lineTo(width, height);
          tempCtx.lineTo(0, height);
          tempCtx.closePath();
          if (fillColor !== 'transparent') {
            tempCtx.fill();
          }
          tempCtx.stroke();
        } else if (obj.type === 'polygon') {
          const sides = 6;
          const radius = Math.min(width, height) / 2;
          const centerX = width / 2;
          const centerY = height / 2;
          
          tempCtx.beginPath();
          for (let i = 0; i < sides; i++) {
            const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
            const px = centerX + radius * Math.cos(angle);
            const py = centerY + radius * Math.sin(angle);
            if (i === 0) tempCtx.moveTo(px, py);
            else tempCtx.lineTo(px, py);
          }
          tempCtx.closePath();
          if (fillColor !== 'transparent') {
            tempCtx.fill();
          }
          tempCtx.stroke();
        } else if (obj.type === 'star') {
          const spikes = 5;
          const outerRadius = Math.min(width, height) / 2;
          const innerRadius = outerRadius / 2;
          const centerX = width / 2;
          const centerY = height / 2;
          
          tempCtx.beginPath();
          for (let i = 0; i < spikes * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (i * Math.PI) / spikes - Math.PI / 2;
            const px = centerX + radius * Math.cos(angle);
            const py = centerY + radius * Math.sin(angle);
            if (i === 0) tempCtx.moveTo(px, py);
            else tempCtx.lineTo(px, py);
          }
          tempCtx.closePath();
          if (fillColor !== 'transparent') {
            tempCtx.fill();
          }
          tempCtx.stroke();
        } else if (obj.type === 'line') {
          tempCtx.beginPath();
          tempCtx.moveTo(0, height / 2);
          tempCtx.lineTo(width, height / 2);
          tempCtx.stroke();
        } else if (obj.type === 'image') {
          const imageUrl = obj.data.imageUrl;
          const img = imageCache.current.get(imageUrl);
          if (img && img.complete && img.naturalWidth > 0) {
            tempCtx.drawImage(img, 0, 0, width, height);
          }
        }

        // Apply eraser using destination-out
        tempCtx.globalCompositeOperation = 'destination-out';
        obj.data.erasedAreas.forEach((area: { x: number; y: number; size: number }[]) => {
          area.forEach(point => {
            tempCtx.beginPath();
            // Convert normalized coordinates (0-1) back to actual pixel coordinates
            const actualX = point.x * width;
            const actualY = point.y * height;
            const actualSize = point.size * Math.min(width, height);
            tempCtx.arc(actualX, actualY, actualSize / 2, 0, Math.PI * 2);
            tempCtx.fillStyle = 'rgba(0,0,0,1)';
            tempCtx.fill();
          });
        });

        // Draw the temp canvas onto main canvas
        ctx.globalAlpha = opacity ?? 1;
        ctx.drawImage(tempCanvas, -10, -10);
        ctx.globalAlpha = 1;
      }
    } else {
      // Draw normally without eraser
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      // Apply object opacity
      const objectOpacity = opacity ?? 1;

      if (obj.type === 'drawn' && obj.data.path) {
        const path = obj.data.path as { x: number; y: number }[];
        const brushType = obj.data.brushType || 'normal';
        
        if (brushType === 'spray' && obj.data.sprayParticles) {
          // Spray effect: use pre-generated particles (NO random generation!)
          ctx.fillStyle = strokeColor;
          const particles = obj.data.sprayParticles as { x: number; y: number; size: number; alpha: number }[];
          
          particles.forEach(particle => {
            ctx.globalAlpha = particle.alpha * objectOpacity;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.globalAlpha = 1;
        } else if (brushType === 'marker') {
          // Marker effect: semi-transparent smooth stroke
          ctx.globalAlpha = 0.6 * objectOpacity;
          ctx.beginPath();
          if (path.length > 0) {
            const firstPoint = path[0];
            ctx.moveTo(firstPoint.x - x, firstPoint.y - y);
            for (let i = 1; i < path.length; i++) {
              ctx.lineTo(path[i].x - x, path[i].y - y);
            }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        } else {
          // Normal brush: regular stroke
          ctx.globalAlpha = objectOpacity;
          ctx.beginPath();
          if (path.length > 0) {
            const firstPoint = path[0];
            ctx.moveTo(firstPoint.x - x, firstPoint.y - y);
            for (let i = 1; i < path.length; i++) {
              ctx.lineTo(path[i].x - x, path[i].y - y);
            }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      } else if (obj.type === 'rectangle') {
        ctx.globalAlpha = objectOpacity;
        if (fillColor !== 'transparent') {
          ctx.fillRect(0, 0, width, height);
        }
        ctx.strokeRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      } else if (obj.type === 'circle') {
        ctx.globalAlpha = objectOpacity;
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
        if (fillColor !== 'transparent') {
          ctx.fill();
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (obj.type === 'triangle') {
        ctx.globalAlpha = objectOpacity;
        ctx.beginPath();
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        if (fillColor !== 'transparent') {
          ctx.fill();
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (obj.type === 'polygon') {
        ctx.globalAlpha = objectOpacity;
        const sides = 6;
        const radius = Math.min(width, height) / 2;
        const centerX = width / 2;
        const centerY = height / 2;
        
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
          const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
          const px = centerX + radius * Math.cos(angle);
          const py = centerY + radius * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        if (fillColor !== 'transparent') {
          ctx.fill();
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (obj.type === 'star') {
        ctx.globalAlpha = objectOpacity;
        const spikes = 5;
        const outerRadius = Math.min(width, height) / 2;
        const innerRadius = outerRadius / 2;
        const centerX = width / 2;
        const centerY = height / 2;
        
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const radius = i % 2 === 0 ? outerRadius : innerRadius;
          const angle = (i * Math.PI) / spikes - Math.PI / 2;
          const px = centerX + radius * Math.cos(angle);
          const py = centerY + radius * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        if (fillColor !== 'transparent') {
          ctx.fill();
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (obj.type === 'line') {
        ctx.globalAlpha = objectOpacity;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (obj.type === 'image') {
        ctx.globalAlpha = objectOpacity;
        const imageUrl = obj.data.imageUrl;
        
        // Check if image is in cache
        let img = imageCache.current.get(imageUrl);
        
        if (!img) {
          // Load image if not in cache
          img = new Image();
          img.src = imageUrl;
          imageCache.current.set(imageUrl, img);
          
          // Force re-render when image loads
          img.onload = () => {
            setForceUpdate(prev => prev + 1);
          };
        }
        
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, 0, 0, width, height);
        }
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }, []);

  const drawSelectionBox = useCallback((ctx: CanvasRenderingContext2D, obj: CanvasObject) => {
    const { x, y, width, height, rotation } = obj.transform;

    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-width / 2, -height / 2);

    // Selection outline
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(0, 0, width, height);
    ctx.setLineDash([]);

    // Resize handles
    const handleSize = 8;
    const handles = [
      { x: -handleSize / 2, y: -handleSize / 2, cursor: 'nw-resize', id: 'nw' },
      { x: width / 2 - handleSize / 2, y: -handleSize / 2, cursor: 'n-resize', id: 'n' },
      { x: width - handleSize / 2, y: -handleSize / 2, cursor: 'ne-resize', id: 'ne' },
      { x: width - handleSize / 2, y: height / 2 - handleSize / 2, cursor: 'e-resize', id: 'e' },
      { x: width - handleSize / 2, y: height - handleSize / 2, cursor: 'se-resize', id: 'se' },
      { x: width / 2 - handleSize / 2, y: height - handleSize / 2, cursor: 's-resize', id: 's' },
      { x: -handleSize / 2, y: height - handleSize / 2, cursor: 'sw-resize', id: 'sw' },
      { x: -handleSize / 2, y: height / 2 - handleSize / 2, cursor: 'w-resize', id: 'w' },
    ];

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    handles.forEach(handle => {
      ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
      ctx.strokeRect(handle.x, handle.y, handleSize, handleSize);
    });

    // Rotation handle
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, -30);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(width / 2, -30, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw canvas background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw objects
    objects.forEach(obj => {
      drawObject(ctx, obj);
    });

    // Draw current drawing path
    if (currentTool === 'brush' && currentPath.length > 0) {
      ctx.save();
      ctx.globalAlpha = brushOpacity ?? 1;
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      currentPath.forEach(point => {
        ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.restore();
    }

    // Draw shape preview
    if (['rectangle', 'circle', 'triangle', 'polygon', 'star', 'line'].includes(currentTool) && shapeStart && shapeCurrent) {
      const x = Math.min(shapeStart.x, shapeCurrent.x);
      const y = Math.min(shapeStart.y, shapeCurrent.y);
      const width = Math.abs(shapeCurrent.x - shapeStart.x);
      const height = Math.abs(shapeCurrent.y - shapeStart.y);

      ctx.strokeStyle = '#3b82f6';
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      if (currentTool === 'rectangle') {
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
      } else if (currentTool === 'circle') {
        ctx.beginPath();
        ctx.arc(x + width / 2, y + height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (currentTool === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(x + width / 2, y);
        ctx.lineTo(x + width, y + height);
        ctx.lineTo(x, y + height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (currentTool === 'polygon') {
        const sides = 6;
        const radius = Math.min(width, height) / 2;
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
          const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
          const px = centerX + radius * Math.cos(angle);
          const py = centerY + radius * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (currentTool === 'star') {
        const spikes = 5;
        const outerRadius = Math.min(width, height) / 2;
        const innerRadius = outerRadius / 2;
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const radius = i % 2 === 0 ? outerRadius : innerRadius;
          const angle = (i * Math.PI) / spikes - Math.PI / 2;
          const px = centerX + radius * Math.cos(angle);
          const py = centerY + radius * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (currentTool === 'line') {
        ctx.beginPath();
        ctx.moveTo(shapeStart.x, shapeStart.y);
        ctx.lineTo(shapeCurrent.x, shapeCurrent.y);
        ctx.stroke();
      }

      ctx.setLineDash([]);
    }

    // Draw marquee selection
    if (currentTool === 'select' && marqueeStart && marqueeCurrent && !resizeHandle) {
      const x = Math.min(marqueeStart.x, marqueeCurrent.x);
      const y = Math.min(marqueeStart.y, marqueeCurrent.y);
      const width = Math.abs(marqueeCurrent.x - marqueeStart.x);
      const height = Math.abs(marqueeCurrent.y - marqueeStart.y);

      ctx.strokeStyle = '#3b82f6';
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);
      ctx.setLineDash([]);
    }

    // Draw selection boxes
    objects.forEach(obj => {
      if (selectedIds.includes(obj.id)) {
        drawSelectionBox(ctx, obj);
      }
    });

    // Draw custom cursor
    if (mousePosition && mousePosition.x >= 0 && mousePosition.x <= CANVAS_WIDTH && 
        mousePosition.y >= 0 && mousePosition.y <= CANVAS_HEIGHT) {
      
      if (currentTool === 'brush') {
        // Brush cursor
        if (brushType === 'normal') {
          // Normal brush: solid circle outline
          ctx.strokeStyle = brushColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(mousePosition.x, mousePosition.y, brushSize / 2, 0, Math.PI * 2);
          ctx.stroke();
        } else if (brushType === 'spray') {
          // Spray brush: double dashed circles (inner + outer spread)
          ctx.strokeStyle = brushColor;
          ctx.lineWidth = 1;
          
          // Inner circle
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(mousePosition.x, mousePosition.y, brushSize / 2, 0, Math.PI * 2);
          ctx.stroke();
          
          // Outer spread circle
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.arc(mousePosition.x, mousePosition.y, (brushSize * 1.5) / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.setLineDash([]);
        } else if (brushType === 'marker') {
          // Marker brush: semi-transparent circle
          ctx.strokeStyle = brushColor;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.arc(mousePosition.x, mousePosition.y, brushSize / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      } else if (currentTool === 'eraser') {
        // Eraser cursor: red dashed circle
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(mousePosition.x, mousePosition.y, eraserSize / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (['rectangle', 'circle', 'triangle', 'polygon', 'star', 'line'].includes(currentTool)) {
        // Shape tools: crosshair (always show, even while drawing)
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;
        const crossSize = 10;
        
        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(mousePosition.x - crossSize, mousePosition.y);
        ctx.lineTo(mousePosition.x + crossSize, mousePosition.y);
        ctx.stroke();
        
        // Vertical line
        ctx.beginPath();
        ctx.moveTo(mousePosition.x, mousePosition.y - crossSize);
        ctx.lineTo(mousePosition.x, mousePosition.y + crossSize);
        ctx.stroke();
      }
    }
  }, [objects, selectedIds, currentPath, currentTool, dragStart, marqueeCurrent, marqueeStart, resizeHandle, eraserSize, drawObject, drawSelectionBox, brushSize, brushColor, mousePosition, brushType, shapeStart, shapeCurrent]);

  useEffect(() => {
    render();
  }, [render]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasCoords(e);
    
    // Check if outside canvas bounds
    if (pos.x < 0 || pos.x > CANVAS_WIDTH || pos.y < 0 || pos.y > CANVAS_HEIGHT) {
      return;
    }

    if (currentTool === 'brush') {
      setIsDrawing(true);
      setCurrentPath([pos]);
    } else if (currentTool === 'eraser') {
      setIsDrawing(true);
      setCurrentPath([pos]);
    } else if (['rectangle', 'circle', 'triangle', 'polygon', 'star', 'line'].includes(currentTool)) {
      setShapeStart(pos);
      setShapeCurrent(pos);
    } else if (currentTool === 'select') {
      // Check if clicking on a handle
      const selected = objects.find(obj => selectedIds.includes(obj.id));
      if (selected) {
        const { x, y, width, height } = selected.transform;
        const handleSize = 8;
        
        // Transform click point to object's local space (accounting for rotation)
        const localPos = transformPointToObjectSpace(pos.x, pos.y, selected);
        
        // Check rotation handle (in local space coordinates)
        const rotHandleLocalX = width / 2;
        const rotHandleLocalY = -30;
        if (Math.abs(localPos.x - rotHandleLocalX) < 10 && Math.abs(localPos.y - rotHandleLocalY) < 10) {
          setResizeHandle('rotate');
          setRotateStart(pos);
          setDragStart(pos);
          setInitialRotation(selected.transform.rotation);
          return;
        }

        // Check resize handles (in local space coordinates)
        const handles = [
          { x: 0, y: 0, id: 'nw' },
          { x: width / 2, y: 0, id: 'n' },
          { x: width, y: 0, id: 'ne' },
          { x: width, y: height / 2, id: 'e' },
          { x: width, y: height, id: 'se' },
          { x: width / 2, y: height, id: 's' },
          { x: 0, y: height, id: 'sw' },
          { x: 0, y: height / 2, id: 'w' },
        ];

        for (const handle of handles) {
          if (Math.abs(localPos.x - handle.x) < handleSize * 1.5 && Math.abs(localPos.y - handle.y) < handleSize * 1.5) {
            setResizeHandle(handle.id);
            setDragStart(pos);
            return;
          }
        }

        // Check if clicking inside selected object to drag
        if (isPointInObject(pos.x, pos.y, selected)) {
          setDragStart(pos);
          setDragOffset({ x: pos.x - x, y: pos.y - y });
          return;
        }
      }

      // Check if clicking on an object
      const clickedObj = [...objects].reverse().find(obj => isPointInObject(pos.x, pos.y, obj));
      if (clickedObj) {
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+Click: Multi-select (toggle selection)
          if (selectedIds.includes(clickedObj.id)) {
            onSelectedIdsChange(selectedIds.filter(id => id !== clickedObj.id));
          } else {
            onSelectedIdsChange([...selectedIds, clickedObj.id]);
          }
        } else {
          // Normal click: Select single object
          onSelectedIdsChange([clickedObj.id]);
          setDragStart(pos);
          setDragOffset({ x: pos.x - clickedObj.transform.x, y: pos.y - clickedObj.transform.y });
        }
      } else {
        // Start marquee selection
        if (!e.ctrlKey && !e.metaKey) {
          onSelectedIdsChange([]);
        }
        setMarqueeStart(pos);
        setMarqueeCurrent(pos);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasCoords(e);
    setMarqueeCurrent(pos);
    setMousePosition(pos);

    // Update shape preview
    if (shapeStart) {
      setShapeCurrent(pos);
    }

    if (currentTool === 'brush' && isDrawing) {
      setCurrentPath(prev => [...prev, pos]);
    } else if (currentTool === 'eraser' && isDrawing) {
      // Apply eraser using the recursive function
      const newObjects = objects.map(obj => {
        if (isPointInObject(pos.x, pos.y, obj)) {
          return applyEraserToObject(obj, currentPath, pos, eraserSize);
        }
        return obj;
      });
      
      onObjectsChange(newObjects);
      setCurrentPath([pos]);
    } else if (currentTool === 'select' && dragStart && selectedIds.length > 0 && !marqueeStart) {
      const selected = objects.find(obj => selectedIds.includes(obj.id));
      if (!selected) return;

      if (resizeHandle) {
        if (resizeHandle === 'rotate') {
          const centerX = selected.transform.x + selected.transform.width / 2;
          const centerY = selected.transform.y + selected.transform.height / 2;
          const angle = Math.atan2(pos.y - centerY, pos.x - centerX) * (180 / Math.PI) + 90;
          
          const newObjects = objects.map(obj =>
            obj.id === selected.id
              ? { ...obj, transform: { ...obj.transform, rotation: angle } }
              : obj
          );
          onObjectsChange(newObjects);
        } else {
          // Resize
          let newTransform = { ...selected.transform };
          const dx = pos.x - dragStart.x;
          const dy = pos.y - dragStart.y;
          
          const oldTransform = { ...selected.transform };

          if (resizeHandle.includes('n')) {
            newTransform.y += dy;
            newTransform.height -= dy;
          }
          if (resizeHandle.includes('s')) {
            newTransform.height += dy;
          }
          if (resizeHandle.includes('w')) {
            newTransform.x += dx;
            newTransform.width -= dx;
          }
          if (resizeHandle.includes('e')) {
            newTransform.width += dx;
          }

          // Constrain
          if (newTransform.width < 10) newTransform.width = 10;
          if (newTransform.height < 10) newTransform.height = 10;
          
          const constrained = constrainToCanvas(
            newTransform.x,
            newTransform.y,
            newTransform.width,
            newTransform.height
          );
          newTransform = { ...newTransform, ...constrained };

          const newObjects = objects.map(obj => {
            if (obj.id === selected.id) {
              // For drawn objects, we need to scale the path points (but NOT erasedAreas anymore!)
              if (obj.type === 'drawn' && obj.data.path) {
                const scaleX = newTransform.width / oldTransform.width;
                const scaleY = newTransform.height / oldTransform.height;
                const offsetX = newTransform.x - oldTransform.x;
                const offsetY = newTransform.y - oldTransform.y;
                
                const newPath = (obj.data.path as { x: number; y: number }[]).map(point => ({
                  x: oldTransform.x + (point.x - oldTransform.x) * scaleX + offsetX,
                  y: oldTransform.y + (point.y - oldTransform.y) * scaleY + offsetY
                }));
                
                // erasedAreas are now normalized (0-1), so they don't need to be scaled!
                return {
                  ...obj,
                  transform: newTransform,
                  data: {
                    ...obj.data,
                    path: newPath
                  }
                };
              }
              
              // For other object types, erasedAreas are normalized (0-1), so they don't need scaling!
              return { ...obj, transform: newTransform };
            }
            return obj;
          });
          onObjectsChange(newObjects);
          setDragStart(pos);
        }
      } else {
        // Move object
        const newX = pos.x - dragOffset.x;
        const newY = pos.y - dragOffset.y;
        const constrained = constrainToCanvas(newX, newY, selected.transform.width, selected.transform.height);

        // Calculate the movement delta
        const deltaX = constrained.x - selected.transform.x;
        const deltaY = constrained.y - selected.transform.y;

        const newObjects = objects.map(obj => {
          if (obj.id === selected.id) {
            // For merged objects, children are in relative coordinates, so just move the parent
            if (obj.type === 'merged' && obj.children) {
              return {
                ...obj,
                transform: { ...obj.transform, x: constrained.x, y: constrained.y }
              };
            }
            
            // For drawn objects, also move the path points
            if (obj.type === 'drawn' && obj.data.path) {
              const newPath = (obj.data.path as { x: number; y: number }[]).map(point => ({
                x: point.x + deltaX,
                y: point.y + deltaY
              }));
              
              return {
                ...obj,
                transform: { ...obj.transform, x: constrained.x, y: constrained.y },
                data: {
                  ...obj.data,
                  path: newPath
                }
              };
            }
            
            return { ...obj, transform: { ...obj.transform, x: constrained.x, y: constrained.y } };
          }
          return obj;
        });
        onObjectsChange(newObjects);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasCoords(e);

    if (currentTool === 'brush' && isDrawing && currentPath.length > 1) {
      // Calculate bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      currentPath.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });

      const padding = brushSize;
      const objectX = minX - padding;
      const objectY = minY - padding;
      
      // Pre-generate spray particles if using spray brush
      const sprayParticles = brushType === 'spray' 
        ? generateSprayParticles(currentPath, brushSize, objectX, objectY)
        : undefined;
      
      const newObject: CanvasObject = {
        id: `drawn-${Date.now()}`,
        type: 'drawn',
        transform: {
          x: objectX,
          y: objectY,
          width: maxX - minX + padding * 2,
          height: maxY - minY + padding * 2,
          rotation: 0
        },
        style: {
          strokeColor: brushColor,
          fillColor: 'transparent',
          strokeWidth: brushSize,
          opacity: brushOpacity
        },
        data: {
          path: currentPath,
          brushType: brushType,
          sprayParticles: sprayParticles, // Save pre-generated particles
          erasedAreas: []
        }
      };

      onObjectsChange([...objects, newObject]);
      setCurrentPath([]);
    } else if (['rectangle', 'circle', 'triangle', 'polygon', 'star', 'line'].includes(currentTool) && shapeStart && shapeCurrent) {
      const x = Math.min(shapeStart.x, shapeCurrent.x);
      const y = Math.min(shapeStart.y, shapeCurrent.y);
      const width = Math.abs(shapeCurrent.x - shapeStart.x);
      const height = Math.abs(shapeCurrent.y - shapeStart.y);

      if (width > 10 && height > 10) {
        const constrained = constrainToCanvas(x, y, width, height);
        
        const newObject: CanvasObject = {
          id: `${currentTool}-${Date.now()}`,
          type: currentTool as any,
          transform: {
            ...constrained,
            rotation: 0
          },
          style: {
            strokeColor: '#000000',
            fillColor: currentTool === 'line' ? 'transparent' : '#e0e0e0',
            strokeWidth: 2
          },
          data: {
            erasedAreas: []
          }
        };

        onObjectsChange([...objects, newObject]);
      }

      setShapeStart(null);
      setShapeCurrent(null);
    } else if ((currentTool === 'select' || currentTool === 'merge') && marqueeStart && marqueeCurrent) {
      // Marquee selection
      const x1 = Math.min(marqueeStart.x, marqueeCurrent.x);
      const y1 = Math.min(marqueeStart.y, marqueeCurrent.y);
      const x2 = Math.max(marqueeStart.x, marqueeCurrent.x);
      const y2 = Math.max(marqueeStart.y, marqueeCurrent.y);

      const selectedObjects = objects.filter(obj => {
        const { x, y, width, height } = obj.transform;
        return x >= x1 && y >= y1 && x + width <= x2 && y + height <= y2;
      });

      if (e.ctrlKey || e.metaKey) {
        // Ctrl + Marquee: Add to current selection
        const newIds = selectedObjects.map(obj => obj.id).filter(id => !selectedIds.includes(id));
        onSelectedIdsChange([...selectedIds, ...newIds]);
      } else {
        // Normal marquee: Replace selection
        onSelectedIdsChange(selectedObjects.map(obj => obj.id));
      }

      setMarqueeStart(null);
      setMarqueeCurrent(null);
    }

    setIsDrawing(false);
    setDragStart(null);
    setResizeHandle(null);
    setRotateStart(null);
  };

  return (
    <div className="w-full h-full bg-gray-300 flex items-center justify-center p-8 overflow-auto">
      <div className="relative" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center' }}>
        <div className="absolute -top-8 left-0 right-0 text-center text-xs text-gray-600 bg-yellow-50 py-1 px-2 rounded border border-yellow-200">
          Objects cannot go beyond this canvas area
        </div>
        
        <div className="relative shadow-2xl">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              setMarqueeCurrent(null);
              setMousePosition(null);
            }}
            className="bg-white"
            style={{ cursor: currentTool === 'select' ? 'default' : 'none' }}
          />
        </div>

        <div className="absolute -bottom-8 left-0 right-0 text-center text-[10px] text-gray-400">
          CanvasObject component • SelectionBox component
        </div>
      </div>
    </div>
  );
}