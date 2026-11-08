/**
 * Canvas Overlay Renderer for Spell AoE Templates
 */

import {
  AoEShape,
  type AoETemplateSize,
  type Point,
} from '../../../../utils/rules/spellAoE';

export interface ViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

export interface RenderTemplateOptions {
  shape: AoEShape;
  size: AoETemplateSize;
  originGrid: Point; // in grid coordinates (cells)
  targetGrid?: Point | null; // in grid coordinates (cells)
  angleRad?: number;
  gridSize: number; // pixels per grid cell
  feetPerGrid?: number; // default 5
  color?: string; // default rgb(59, 130, 246)
  alpha?: number; // default 0.25
  strokeWidth?: number; // default 2
}

/**
 * Converts grid coordinates to screen pixels based on viewport pan/zoom
 */
export function gridToScreen(
  gridPoint: Point,
  gridSize: number,
  viewport: ViewportTransform
): Point {
  return {
    x: (gridPoint.x * gridSize - viewport.x) * viewport.zoom,
    y: (gridPoint.y * gridSize - viewport.y) * viewport.zoom,
  };
}

/**
 * Draws an AoE spell template on an HTML5 canvas context.
 */
export function renderAoETemplate(
  ctx: CanvasRenderingContext2D,
  options: RenderTemplateOptions,
  viewport: ViewportTransform
): void {
  const {
    shape,
    size,
    originGrid,
    targetGrid,
    gridSize,
    feetPerGrid = 5,
    color = 'rgb(59, 130, 246)',
    alpha = 0.25,
    strokeWidth = 2,
  } = options;

  const originScreen = gridToScreen(originGrid, gridSize, viewport);
  const feetToScreen = (feet: number) => (feet / feetPerGrid) * gridSize * viewport.zoom;

  // Calculate angle
  let angle = options.angleRad || 0;
  if (targetGrid && (targetGrid.x !== originGrid.x || targetGrid.y !== originGrid.y)) {
    angle = Math.atan2(targetGrid.y - originGrid.y, targetGrid.x - originGrid.x);
  }

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth * viewport.zoom;

  switch (shape) {
    case AoEShape.CIRCLE:
    case AoEShape.SPHERE:
    case AoEShape.CYLINDER:
    case AoEShape.HEMISPHERE: {
      const radiusScreen = feetToScreen(size.radius || 20);
      ctx.beginPath();
      ctx.arc(originScreen.x, originScreen.y, radiusScreen, 0, Math.PI * 2);
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.stroke();

      // Draw center reticle
      ctx.beginPath();
      ctx.arc(originScreen.x, originScreen.y, 4 * viewport.zoom, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case AoEShape.CONE: {
      const lengthScreen = feetToScreen(size.length || 15);
      const halfAngle = Math.atan(0.5); // standard ~26.56° spread (width = length)

      ctx.beginPath();
      ctx.moveTo(originScreen.x, originScreen.y);
      ctx.arc(
        originScreen.x,
        originScreen.y,
        lengthScreen,
        angle - halfAngle,
        angle + halfAngle
      );
      ctx.closePath();

      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.stroke();
      break;
    }

    case AoEShape.LINE: {
      const lengthScreen = feetToScreen(size.length || 60);
      const widthScreen = feetToScreen(size.width || 5);
      const halfWidth = widthScreen / 2;

      ctx.translate(originScreen.x, originScreen.y);
      ctx.rotate(angle);

      ctx.beginPath();
      ctx.rect(0, -halfWidth, lengthScreen, widthScreen);

      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.stroke();
      break;
    }

    case AoEShape.CUBE: {
      const sideScreen = feetToScreen(size.side || 15);

      ctx.translate(originScreen.x, originScreen.y);
      ctx.rotate(angle);

      ctx.beginPath();
      ctx.rect(0, -sideScreen / 2, sideScreen, sideScreen);

      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.stroke();
      break;
    }

    case AoEShape.CUSTOM: {
      const pts = size.points || [];
      if (pts.length >= 3) {
        ctx.beginPath();
        const first = pts[0];
        const firstPx = {
          x: originScreen.x + feetToScreen(first.x),
          y: originScreen.y + feetToScreen(first.y),
        };
        ctx.moveTo(firstPx.x, firstPx.y);
        for (let i = 1; i < pts.length; i++) {
          const ptPx = {
            x: originScreen.x + feetToScreen(pts[i].x),
            y: originScreen.y + feetToScreen(pts[i].y),
          };
          ctx.lineTo(ptPx.x, ptPx.y);
        }
        ctx.closePath();

        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.stroke();
      }
      break;
    }
  }

  ctx.restore();
}
