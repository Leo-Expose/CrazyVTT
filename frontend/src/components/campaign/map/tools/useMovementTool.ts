// ============================================
// Movement Tool (Phase 6)
// Real-time token movement with reachable area preview, ghost token, and AoO detection
// ============================================

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { CampaignMap, Token, Position, ReachableSquare, MovementMode } from '@/types';
import type { MapControls, MapTool, PointerAt, ToolSocketSource } from './types';
import type { MapLayer } from '../useRenderLoop';

interface UseMovementToolArgs {
  isDM: boolean;
  currentMap: CampaignMap | null;
  tokens: Token[];
  socket: ToolSocketSource | null | undefined;
  mapControls: MapControls;
  markDirty: (...layers: MapLayer[]) => void;
  /** Set while the right button pans the map under a tool. */
  rightPanActiveRef: RefObject<boolean>;
  /** Current initiative state for turn integration */
  combatActive: boolean;
  currentTurnTokenId: string | null;
  /** User ID for permission checks */
  userId: string | null;
  userRole: 'DM' | 'PLAYER' | 'SPECTATOR' | null;
}

interface GhostToken {
  tokenId: string;
  x: number;
  y: number;
  path: { x: number; y: number }[];
  cost: number;
  isValid: boolean;
}

export function useMovementTool({
  isDM: _isDM,
  currentMap,
  tokens,
  socket,
  mapControls,
  markDirty,
  rightPanActiveRef,
  combatActive,
  currentTurnTokenId,
  userId,
  userRole,
}: UseMovementToolArgs) {
  // Movement tool state
  const [isMovementToolActive, setIsMovementToolActive] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [reachableArea, setReachableArea] = useState<ReachableSquare[]>([]);
  const [ghostToken, setGhostToken] = useState<GhostToken | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [movementMode, setMovementMode] = useState<MovementMode>('walk');
  const [showPathPreview, setShowPathPreview] = useState(true);
  const [dmOverrideMode, setDmOverrideMode] = useState(false);
  
  // Refs for async operations
  const calculationIdRef = useRef(0);
  const dragStartPosRef = useRef<Position | null>(null);
  const selectedTokenRef = useRef<Token | null>(null);
  const reachableResultRef = useRef<{ reachable: ReachableSquare[]; movementMode: MovementMode } | null>(null);
  
  // Get token from store by ID
  const _getToken = useCallback((tokenId: string): Token | undefined => {
    return tokens.find(t => t.id === tokenId);
  }, [tokens]);
  void _getToken;
  
  // Check if user can control a token
  const canControlToken = useCallback((token: Token): boolean => {
    if (userRole === 'DM') return true;
    return userRole === 'PLAYER' && !!userId && token.controlledBy === userId;
  }, [userId, userRole]);
  
  // Check if it's the token's turn (for initiative integration)
  const isTokenTurn = useCallback((tokenId: string): boolean => {
    if (!combatActive) return true; // Free movement outside combat
    return currentTurnTokenId === tokenId;
  }, [combatActive, currentTurnTokenId]);
  
  // Calculate reachable area for a token
  const calculateReachable = useCallback(async (token: Token, mode: MovementMode) => {
    if (!currentMap || !socket) return;
    
    calculationIdRef.current += 1;
    const myCalculationId = calculationIdRef.current;
    setIsCalculating(true);
    
    try {
      const socketInstance = socket.getSocket();
      if (!socketInstance) return;
      
      // Request reachable area from server
      const response = await new Promise<{ reachable: ReachableSquare[]; movementMode: MovementMode }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
        
        const handler = (data: { reachable: ReachableSquare[]; movementMode: MovementMode }) => {
          clearTimeout(timeout);
          socketInstance.off?.('movement:reachable:result', handler);
          resolve(data);
        };
        
        socketInstance.on?.('movement:reachable:result', handler);
        socketInstance.emit('movement:reachable', { 
          tokenId: token.id, 
          mapId: currentMap.id,
          movementMode: mode,
        });
      });
      
      // Ignore stale responses
      if (myCalculationId !== calculationIdRef.current) return;
      
      setReachableArea(response.reachable);
      reachableResultRef.current = response;
      setMovementMode(response.movementMode as MovementMode);
    } catch {
      console.error('Failed to calculate reachable area');
      setReachableArea([]);
      reachableResultRef.current = null;
    } finally {
      if (myCalculationId === calculationIdRef.current) {
        setIsCalculating(false);
      }
    }
  }, [currentMap, socket]);
  
  // Start movement drag
  const startMovement = useCallback(async (token: Token) => {
    if (!currentMap || !socket) return;
    
    // Check permissions
    if (!canControlToken(token)) return;
    if (!isTokenTurn(token.id)) return;
    
    // Check if token has movement remaining
    const movement = token.movement;
    if (movement && movement.remainingThisTurn <= 0) return;
    
    setSelectedTokenId(token.id);
    selectedTokenRef.current = token;
    dragStartPosRef.current = { x: token.position.x, y: token.position.y };
    setIsMovementToolActive(true);
    
    // Calculate reachable area
    await calculateReachable(token, movementMode);
    
    // Send start event to server
    const socketInstance = socket.getSocket();
    if (socketInstance) {
      socketInstance.emit('movement:start', { tokenId: token.id, mapId: currentMap.id });
    }
    
    markDirty('overlay');
  }, [currentMap, socket, canControlToken, isTokenTurn, movementMode, calculateReachable, markDirty]);
  
  // Update ghost token during drag
  const updateGhostToken = useCallback((mapPx: Position) => {
    if (!currentMap || !reachableResultRef.current || !selectedTokenRef.current) return;
    
    // Snap to grid
    const gridSize = currentMap.gridSize;
    const snappedX = Math.round(mapPx.x / gridSize) * gridSize;
    const snappedY = Math.round(mapPx.y / gridSize) * gridSize;
    const gridX = snappedX / gridSize;
    const gridY = snappedY / gridSize;
    
    // Check bounds
    if (gridX < 0 || gridX >= currentMap.width || gridY < 0 || gridY >= currentMap.height) {
      setGhostToken(null);
      return;
    }
    
    // Find reachable square
    const reachable = reachableResultRef.current.reachable.find(
      s => s.x === gridX && s.y === gridY
    );
    
    if (reachable) {
      // Valid target
      setGhostToken({
        tokenId: selectedTokenRef.current.id,
        x: snappedX,
        y: snappedY,
        path: reachable.path,
        cost: reachable.cost,
        isValid: true,
      });
    } else {
      // Invalid target (out of range)
      setGhostToken({
        tokenId: selectedTokenRef.current.id,
        x: snappedX,
        y: snappedY,
        path: [],
        cost: 0,
        isValid: false,
      });
    }
    
    markDirty('overlay');
  }, [currentMap, markDirty]);
  
  // Send movement frame to server
  const sendMovementFrame = useCallback((x: number, y: number, _path: { x: number; y: number }[], _cost: number) => {
    if (!currentMap || !socket || !selectedTokenRef.current) return;
    
    const socketInstance = socket.getSocket();
    if (socketInstance) {
      socketInstance.emit('movement:move', { 
        tokenId: selectedTokenRef.current.id, 
        mapId: currentMap.id, 
        x: x / currentMap.gridSize, 
        y: y / currentMap.gridSize 
      });
    }
  }, [currentMap, socket]);
  
  // Cancel movement
  const cancelMovement = useCallback(async () => {
    if (!currentMap || !socket || !selectedTokenRef.current) return;
    
    const token = selectedTokenRef.current;
    const startPos = dragStartPosRef.current;
    
    // Send cancel to server
    const socketInstance = socket.getSocket();
    if (socketInstance) {
      socketInstance.emit('movement:cancel', { tokenId: token.id, mapId: currentMap.id });
    }
    
    // If we have a start position, move token back locally (server will confirm)
    if (startPos) {
      // The server will broadcast the correction
    }
    
    // Clean up
    setIsMovementToolActive(false);
    setSelectedTokenId(null);
    setReachableArea([]);
    setGhostToken(null);
    reachableResultRef.current = null;
    selectedTokenRef.current = null;
    dragStartPosRef.current = null;
    
    markDirty('overlay');
  }, [currentMap, socket, markDirty]);

  // Commit movement
  const commitMovement = useCallback(async (x: number, y: number) => {
    if (!currentMap || !socket || !selectedTokenRef.current || !ghostToken) return;
    
    const token = selectedTokenRef.current;
    const gridX = x / currentMap.gridSize;
    const gridY = y / currentMap.gridSize;
    
    // Verify target is valid
    if (!ghostToken.isValid) {
      await cancelMovement();
      return;
    }
    
    const path = ghostToken.path;
    const cost = ghostToken.cost;
    
    // Send commit to server
    const socketInstance = socket.getSocket();
    if (socketInstance) {
      socketInstance.emit('movement:commit', {
        tokenId: token.id,
        mapId: currentMap.id,
        x: gridX,
        y: gridY,
        path,
        speedUsed: cost,
      });
    }
    
    // Clean up
    setIsMovementToolActive(false);
    setSelectedTokenId(null);
    setReachableArea([]);
    setGhostToken(null);
    reachableResultRef.current = null;
    selectedTokenRef.current = null;
    dragStartPosRef.current = null;
    
    markDirty('overlay', 'tokens');
  }, [currentMap, socket, ghostToken, markDirty, cancelMovement]);
  
  // DM Override: Teleport
  const teleportToken = useCallback(async (token: Token, x: number, y: number) => {
    if (!currentMap || !socket || userRole !== 'DM') return;
    
    const socketInstance = socket.getSocket();
    if (socketInstance) {
      socketInstance.emit('movement:dm_override', {
        tokenId: token.id,
        mapId: currentMap.id,
        type: 'teleport',
        position: { x: x / currentMap.gridSize, y: y / currentMap.gridSize },
      });
    }
  }, [currentMap, socket, userRole]);
  
  // DM Override: Grant extra movement
  const grantExtraMovement = useCallback(async (token: Token, extraFeet: number) => {
    if (!currentMap || !socket || userRole !== 'DM') return;
    
    const socketInstance = socket.getSocket();
    if (socketInstance) {
      socketInstance.emit('movement:dm_override', {
        tokenId: token.id,
        mapId: currentMap.id,
        type: 'grant_extra',
        value: extraFeet,
      });
    }
  }, [currentMap, socket, userRole]);
  
  // DM Override: Reset movement
  const resetMovement = useCallback(async (token: Token) => {
    if (!currentMap || !socket || userRole !== 'DM') return;
    
    const socketInstance = socket.getSocket();
    if (socketInstance) {
      socketInstance.emit('movement:dm_override', {
        tokenId: token.id,
        mapId: currentMap.id,
        type: 'reset',
      });
    }
  }, [currentMap, socket, userRole]);
  
  // Change movement mode
  const changeMovementMode = useCallback(async (token: Token, mode: MovementMode) => {
    if (!currentMap || !socket) return;
    
    if (!canControlToken(token) && userRole !== 'DM') return;
    
    const socketInstance = socket.getSocket();
    if (socketInstance) {
      socketInstance.emit('movement:mode_change', {
        tokenId: token.id,
        mapId: currentMap.id,
        movementMode: mode,
      });
    }
    
    // Recalculate reachable area for new mode
    if (isMovementToolActive && selectedTokenRef.current?.id === token.id) {
      await calculateReachable(token, mode);
    }
  }, [currentMap, socket, canControlToken, userRole, isMovementToolActive, calculateReachable]);
  
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isMovementToolActive) return;
      
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          cancelMovement();
          break;
        case 'm':
        case 'M':
          // Cycle movement mode
          if (selectedTokenRef.current) {
            const modes: MovementMode[] = ['walk', 'fly', 'swim', 'climb', 'burrow', 'teleport'];
            const currentIndex = modes.indexOf(movementMode);
            const nextMode = modes[(currentIndex + 1) % modes.length];
            changeMovementMode(selectedTokenRef.current, nextMode);
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMovementToolActive, movementMode, cancelMovement, changeMovementMode]);
  
  // Clean up on map change
  useEffect(() => {
    return () => {
      setIsMovementToolActive(false);
      setSelectedTokenId(null);
      setReachableArea([]);
      setGhostToken(null);
      reachableResultRef.current = null;
      selectedTokenRef.current = null;
      dragStartPosRef.current = null;
    };
  }, [currentMap?.id]);
  
  const tool: MapTool = {
    down({ e, mapPx, screenX: _screenX, screenY: _screenY }: PointerAt) {
      if (!isMovementToolActive) return false;
      
      // Left click to start/commit movement
      if (e.button === 0) {
        if (!selectedTokenRef.current) {
          // Try to select a token at this position
          const gridSize = currentMap?.gridSize ?? 50;
          const gridX = Math.round(mapPx.x / gridSize);
          const gridY = Math.round(mapPx.y / gridSize);
          
          const token = tokens.find(t => 
            t.position.x === gridX && t.position.y === gridY && canControlToken(t)
          );
          
          if (token) {
            startMovement(token);
            return true;
          }
        } else if (ghostToken) {
          // Commit movement
          commitMovement(ghostToken.x, ghostToken.y);
          return true;
        }
      }
      
      // Right click to cancel
      if (e.button === 2) {
        e.preventDefault();
        cancelMovement();
        return true;
      }
      
      return false;
    },
    
    move({ e, mapPx }: PointerAt) {
      if (!isMovementToolActive) return false;
      
      if (rightPanActiveRef.current) {
        mapControls.handleDrag(e);
        markDirty('terrain', 'tokens', 'overlay');
        return true;
      }
      
      if (selectedTokenRef.current) {
        updateGhostToken(mapPx);
        if (ghostToken?.isValid) {
          sendMovementFrame(ghostToken.x, ghostToken.y, ghostToken.path, ghostToken.cost);
        }
        return true;
      }
      
      return false;
    },
    
    up() {
      // Handled in down for click-to-move
      return;
    },
    
    escape() {
      if (isMovementToolActive) {
        cancelMovement();
        return true;
      }
      return false;
    },
  };
  
  // Render data for overlay
  const renderData = {
    isMovementToolActive,
    selectedTokenId,
    reachableArea,
    ghostToken,
    isCalculating,
    movementMode,
    showPathPreview,
    dmOverrideMode,
    startMovement,
    cancelMovement,
    teleportToken,
    grantExtraMovement,
    resetMovement,
    changeMovementMode,
    setMovementMode,
    setShowPathPreview,
    setDmOverrideMode,
  };
  
  return { tool, renderData };
}
