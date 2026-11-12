// ============================================
// Image Import Hook - Upload, crop, scale, align grid
// ============================================

import { useCallback, useRef, useState } from 'react';
import { randomId } from '@/utils/uuid';
import { api } from '@/services/api';
import { useToast } from '@/contexts/ToastContext';
import type { ImageMapData } from '@/types';

interface ImageImportOptions {
  mapId: string;
  campaignId: string;
  gridSize: number;
  onImagePlaced: (imageMap: ImageMapData) => void;
  onProgress?: (progress: number) => void;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageImportState {
  file: File | null;
  imageUrl: string | null;
  imageElement: HTMLImageElement | null;
  originalWidth: number;
  originalHeight: number;
  cropArea: CropArea | null;
  scale: number;
  rotation: number;
  gridAligned: boolean;
  gridOffsetX: number;
  gridOffsetY: number;
  gridSize: number;
  opacity: number;
  uploading: boolean;
  uploadProgress: number;
  assetId: string | null;
}

const DEFAULT_STATE: ImageImportState = {
  file: null,
  imageUrl: null,
  imageElement: null,
  originalWidth: 0,
  originalHeight: 0,
  cropArea: null,
  scale: 1,
  rotation: 0,
  gridAligned: true,
  gridOffsetX: 0,
  gridOffsetY: 0,
  gridSize: 100,
  opacity: 1,
  uploading: false,
  uploadProgress: 0,
  assetId: null,
};

export function useImageImport(options: ImageImportOptions) {
  const { mapId, campaignId, gridSize: mapGridSize, onImagePlaced, onProgress } = options;
  const { showToast } = useToast();
  
  const [state, setState] = useState<ImageImportState>(DEFAULT_STATE);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize with map grid size
  useState(() => {
    setState(prev => ({ ...prev, gridSize: mapGridSize }));
  }, []);

  const resetState = useCallback(() => {
    if (state.imageUrl) {
      URL.revokeObjectURL(state.imageUrl);
    }
    if (state.imageElement) {
      state.imageElement.onload = null;
      state.imageElement.src = '';
    }
    setState(DEFAULT_STATE);
  }, [state.imageUrl, state.imageElement]);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }

    // Check file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      showToast('Image file too large (max 50MB)', 'error');
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      
      // Default crop to full image
      const cropArea: CropArea = { x: 0, y: 0, width, height };
      
      // Calculate initial scale to fit map reasonably
      const maxDimension = Math.max(width, height);
      const initialScale = Math.min(1, 4000 / maxDimension); // Max 4000px
      
      setState(prev => ({
        ...prev,
        file,
        imageUrl,
        imageElement: img,
        originalWidth: width,
        originalHeight: height,
        cropArea,
        scale: initialScale,
        gridSize: mapGridSize,
      }));
    };
    
    img.onerror = () => {
      showToast('Failed to load image', 'error');
      URL.revokeObjectURL(imageUrl);
    };
    
    img.src = imageUrl;
  }, [showToast, mapGridSize]);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input
    if (e.target) e.target.value = '';
  }, [handleFileSelect]);

  const updateCropArea = useCallback((cropArea: CropArea) => {
    setState(prev => ({ ...prev, cropArea }));
  }, []);

  const setScale = useCallback((scale: number) => {
    setState(prev => ({ ...prev, scale: Math.max(0.1, Math.min(10, scale)) }));
  }, []);

  const setRotation = useCallback((rotation: number) => {
    setState(prev => ({ ...prev, rotation: ((rotation % 360) + 360) % 360 }));
  }, []);

  const rotate90 = useCallback(() => {
    setState(prev => ({ ...prev, rotation: (prev.rotation + 90) % 360 }));
  }, []);

  const flipHorizontal = useCallback(() => {
    setState(prev => ({ ...prev, scale: -prev.scale }));
  }, []);

  const flipVertical = useCallback(() => {
    // For vertical flip, we'd need to adjust the crop or use a transform
    // This is a simplified version
    setState(prev => ({ ...prev, rotation: (prev.rotation + 180) % 360 }));
  }, []);

  const toggleGridAlign = useCallback(() => {
    setState(prev => ({ ...prev, gridAligned: !prev.gridAligned }));
  }, []);

  const setGridOffset = useCallback((offsetX: number, offsetY: number) => {
    setState(prev => ({ ...prev, gridOffsetX: offsetX, gridOffsetY: offsetY }));
  }, []);

  const setOpacity = useCallback((opacity: number) => {
    setState(prev => ({ ...prev, opacity: Math.max(0, Math.min(1, opacity)) }));
  }, []);

  const uploadImage = useCallback(async () => {
    const { file, cropArea, scale, rotation, gridAligned, gridOffsetX, gridOffsetY, gridSize, opacity } = state;
    
    if (!file || !cropArea) {
      showToast('No image selected', 'error');
      return;
    }

    setState(prev => ({ ...prev, uploading: true, uploadProgress: 0 }));

    try {
      // Create cropped/scaled version on canvas
      const canvas = cropCanvasRef.current;
      if (!canvas) {
        throw new Error('Canvas not available');
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      const img = state.imageElement;
      if (!img) {
        throw new Error('Image not loaded');
      }

      // Calculate output dimensions
      const outputWidth = Math.round(cropArea.width * Math.abs(scale));
      const outputHeight = Math.round(cropArea.height * Math.abs(scale));
      
      canvas.width = outputWidth;
      canvas.height = outputHeight;

      // Clear canvas
      ctx.clearRect(0, 0, outputWidth, outputHeight);

      // Apply transformations
      ctx.save();
      ctx.translate(outputWidth / 2, outputHeight / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(scale < 0 ? -1 : 1, 1);
      ctx.translate(-outputWidth / 2, -outputHeight / 2);

      // Draw cropped image
      ctx.drawImage(
        img,
        cropArea.x, cropArea.y, cropArea.width, cropArea.height,
        0, 0, outputWidth, outputHeight
      );
      ctx.restore();

      // Convert to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create blob'));
        }, 'image/png', 0.95);
      });

      // Upload to server
      const formData = new FormData();
      formData.append('file', blob, `map-import-${randomId()}.png`);
      formData.append('campaignId', campaignId);

      const uploadResponse = await api.post<{ asset: { id: string } }>(
        '/assets/upload',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setState(prev => ({ ...prev, uploadProgress: progress }));
              onProgress?.(progress);
            }
          },
        }
      );

      const assetId = uploadResponse.data.asset.id;

      // Calculate position on map (centered by default)
      const mapResponse = await api.get<{ map: { width: number; height: number } }>(`/maps/${mapId}`);
      const mapWidth = mapResponse.data.map.width;
      const mapHeight = mapResponse.data.map.height;

      const x = (mapWidth - outputWidth) / 2 + gridOffsetX;
      const y = (mapHeight - outputHeight) / 2 + gridOffsetY;

      const imageMap: ImageMapData = {
        id: randomId(),
        assetId,
        x,
        y,
        width: outputWidth,
        height: outputHeight,
        rotation,
        scale: Math.abs(scale),
        opacity,
        gridAligned,
        gridSize: gridAligned ? gridSize : undefined,
        gridOffsetX: gridAligned ? gridOffsetX : undefined,
        gridOffsetY: gridAligned ? gridOffsetY : undefined,
      };

      // Save image map to map
      await api.post(`/maps/${mapId}/image-maps`, imageMap);

      // Notify placement
      onImagePlaced(imageMap);

      showToast('Image map imported successfully', 'success');
      
      resetState();
    } catch (error) {
      console.error('Image import failed:', error);
      showToast('Failed to import image', 'error');
    } finally {
      setState(prev => ({ ...prev, uploading: false, uploadProgress: 0 }));
    }
  }, [state, campaignId, mapId, onImagePlaced, onProgress, showToast, resetState]);

  const cancelImport = useCallback(() => {
    resetState();
  }, [resetState]);

  // Auto-snap to grid when gridAligned changes
  useState(() => {
    if (state.gridAligned && state.cropArea) {
      // Snap position to grid
      // This would be handled in the UI component
    }
  }, [state.gridAligned, state.cropArea]);

  return {
    // State
    ...state,
    fileInputRef,
    cropCanvasRef,
    
    // Actions
    handleFileSelect,
    openFileDialog,
    handleFileInputChange,
    updateCropArea,
    setScale,
    setRotation,
    rotate90,
    flipHorizontal,
    flipVertical,
    toggleGridAlign,
    setGridOffset,
    setOpacity,
    uploadImage,
    cancelImport,
    resetState,
  };
}

export type ImageImportHook = ReturnType<typeof useImageImport>;