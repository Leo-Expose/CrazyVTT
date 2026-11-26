import { EventEmitter } from 'events';
import type { Server } from 'socket.io';
import { OverrideVisibility } from '@prisma/client';
import { applyPatch } from '../utils/jsonPatch';
import { generateDeck } from '../services/diceDeckService';
import { calculateReachableArea, getMovementCost } from '../services/movement/reachableArea';
import { registerDrawingHandlers } from '../websocket/handlers/drawing';
import { registerLayerHandlers } from '../websocket/handlers/layers';
import { registerSpellHandlers } from '../websocket/handlers/spells';
import { registerOverrideHandlers } from '../websocket/handlers/overrides';
import { registerActionHandlers } from '../websocket/handlers/actions';
import { prisma } from '../config/database';
import { overrideService } from '../services/overrideService';
import type { AuthenticatedSocket } from '../websocket/auth';

function createMockSocket(overrides: Partial<AuthenticatedSocket> = {}) {
  const emitter = new EventEmitter();
  const emitted: Array<{ event: string; payload: unknown }> = [];

  const socket = Object.assign(emitter, {
    id: 'sock-1',
    userId: 'user-1',
    campaignId: 'camp-1',
    role: 'DM',
    handshake: { auth: {}, headers: {} },
    emit: (event: string, payload?: unknown) => {
      emitted.push({ event, payload });
      return true;
    },
  }) as unknown as AuthenticatedSocket & { emitted: Array<{ event: string; payload: unknown }> };

  Object.assign(socket, overrides, { emitted });
  return socket;
}

function createMockIo() {
  const roomEmits: Array<{ room: string; event: string; payload: unknown }> = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        roomEmits.push({ room, event, payload });
      },
    }),
  } as unknown as Server;
  return { io, roomEmits };
}

describe('EGM Stress & Regression Tests (Backend)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refuses another player’s action when starting a resolution', async () => {
    const { io } = createMockIo();
    const socket = createMockSocket({ role: 'PLAYER' });
    jest.spyOn(prisma.character, 'findUnique').mockResolvedValue({ userId: 'user-1', campaignId: 'camp-1' } as never);
    jest.spyOn(prisma.characterAction, 'findUnique').mockResolvedValue({ character: { userId: 'other', campaignId: 'camp-1' } } as never);
    const create = jest.spyOn(prisma.actionResolution, 'create').mockResolvedValue({ id: 'resolution-1' } as never);
    jest.spyOn(prisma.characterAction, 'update').mockResolvedValue({} as never);
    registerActionHandlers(io, socket);
    const ack = jest.fn();
    await Promise.all(socket.listeners('action:startResolution').map((fn) => fn({
      initiatorId: 'my-character', actionId: 'other-action', actionType: 'ATTACK', actionData: {},
    }, ack)));
    expect(create).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  describe('JSON Patch prototype pollution defense', () => {
    it('rejects __proto__, constructor, and prototype in paths and values', () => {
      const target = { hp: { current: 10 }, nested: { value: 1 } };

      expect(() =>
        applyPatch(target, [{ op: 'replace', path: '/__proto__/polluted', value: true }])
      ).toThrow(/Forbidden patch key/);

      expect(() =>
        applyPatch(target, [{ op: 'add', path: '/constructor/prototype/evil', value: 'x' }])
      ).toThrow(/Forbidden patch key/);

      expect(() =>
        applyPatch(target, [
          {
            op: 'replace',
            path: '/nested',
            value: JSON.parse('{"__proto__":{"polluted":true}}'),
          },
        ])
      ).toThrow(/Forbidden patch key/);

      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('applies valid RFC 6902 patches without mutating source', () => {
      const original = { stats: { str: 14 }, tags: ['fighter'] };
      const updated = applyPatch(original, [
        { op: 'replace', path: '/stats/str', value: 18 },
        { op: 'add', path: '/tags/1', value: 'champion' },
      ]) as typeof original;

      expect(original.stats.str).toBe(14);
      expect(updated.stats.str).toBe(18);
      expect(updated.tags).toEqual(['fighter', 'champion']);
    });
  });

  describe('DiceDeckService Cartesian product DoS cap', () => {
    it('rejects expressions whose Cartesian product exceeds 10,000 outcomes', () => {
      expect(() => generateDeck('20d20')).toThrow();
      expect(() => generateDeck('5d20')).toThrow();
    });

    it('generates bounded dice decks such as 2d6', () => {
      const deck = generateDeck('2d6');
      expect(deck).toHaveLength(36);
    });
  });

  describe('ReachableArea alternating diagonal 5e cost', () => {
    it('tracks diagonal count per path so a 2-step diagonal costs 15 ft (5 + 10)', () => {
      const width = 5;
      const height = 5;
      const res = calculateReachableArea({
        token: {
          id: 'tok-1',
          mapId: 'map-1',
          name: 'Hero',
          type: 'PC',
          disposition: 'FRIENDLY',
          imageUrl: '',
          position: { x: 0, y: 0 },
          size: { width: 1, height: 1 },
          visible: true,
          locked: false,
          rotation: 0,
          conditions: [],
          metadata: {},
          layer: 'token',
          movement: { speed: 15 },
        } as unknown as Parameters<typeof calculateReachableArea>[0]['token'],
        map: { width, height, gridSize: 50, feetPerSquare: 5 },
        terrainGrid: {
          width,
          height,
          gridSize: 5,
          terrain: new Array(width * height).fill('normal'),
        },
      });

      expect(getMovementCost(res, 1, 1)).toBe(5);
      expect(getMovementCost(res, 2, 2)).toBe(15);
      expect(getMovementCost(res, 3, 3)).toBeNull();
    });
  });

  describe('WebSocket handler registration before campaign authentication', () => {
    it('registers drawing and layer handlers when socket.campaignId is initially undefined and enforces auth on invocation', async () => {
      const { io } = createMockIo();
      const socket = createMockSocket({ campaignId: undefined, userId: 'user-1', role: 'DM' });

      registerDrawingHandlers(io, socket);
      registerLayerHandlers(io, socket);

      expect(socket.listenerCount('shape:draw')).toBeGreaterThan(0);
      expect(socket.listenerCount('layer:update')).toBeGreaterThan(0);

      await Promise.all(
        socket.listeners('shape:draw').map((fn) => fn({ mapId: 'm1', layerId: 'l1', shape: {} }))
      );
      await Promise.all(
        socket.listeners('layer:update').map((fn) => fn({ mapId: 'm1', layerId: 'l1', name: 'X' }))
      );

      const errorMessages = socket.emitted
        .filter((e) => e.event === 'error')
        .map((e) => (e.payload as { message?: string }).message);
      expect(errorMessages).toEqual([
        'Not authenticated to a campaign',
        'Not authenticated to a campaign',
      ]);
    });
  });

  describe('WebSocket spells and overrides room & RBAC enforcement', () => {
    it('blocks spectators from casting spells and rejects cross-campaign targets', () => {
      const { io, roomEmits } = createMockIo();

      const specSocket = createMockSocket({ id: 'spec-1', role: 'SPECTATOR', campaignId: 'camp-1' });
      registerSpellHandlers(io, specSocket);
      specSocket.listeners('spell:cast').forEach((fn) =>
        fn({
          castId: 'cast-1',
          spellName: 'Fireball',
          origin: { x: 1, y: 1 },
          tokens: [],
        })
      );
      expect(specSocket.emitted.some((e) => e.event === 'error')).toBe(true);
      expect(roomEmits).toHaveLength(0);

      const playerSocket = createMockSocket({ id: 'play-1', role: 'PLAYER', campaignId: 'camp-1' });
      registerSpellHandlers(io, playerSocket);
      playerSocket.listeners('spell:cast').forEach((fn) =>
        fn({
          castId: 'cast-2',
          campaignId: 'other-camp',
          spellName: 'Fireball',
          origin: { x: 1, y: 1 },
          tokens: [],
        })
      );
      expect(playerSocket.emitted.some((e) => e.event === 'error')).toBe(true);
      expect(roomEmits).toHaveLength(0);

      playerSocket.listeners('spell:resolve').forEach((fn) =>
        fn({
          castId: 'cast-2',
          spellName: 'Fireball',
          results: [],
        })
      );
      expect(
        playerSocket.emitted.filter((e) => e.event === 'error').map((e) => (e.payload as { message: string }).message)
      ).toContain('Only the DM can resolve spell casts');
    });

    it('emits spell:review directly to socket.campaignId room without campaign: prefix', () => {
      const { io, roomEmits } = createMockIo();
      const dmSocket = createMockSocket({ id: 'dm-1', role: 'DM', campaignId: 'camp-42' });
      registerSpellHandlers(io, dmSocket);

      dmSocket.listeners('spell:cast').forEach((fn) =>
        fn({
          castId: 'cast-3',
          spellName: 'Burning Hands',
          templateType: 'CONE',
          origin: { x: 0, y: 0 },
          radiusFeet: 15,
          tokens: [],
        })
      );

      expect(roomEmits).toHaveLength(1);
      expect(roomEmits[0].room).toBe('camp-42');
      expect(roomEmits[0].event).toBe('spell:review');
    });

    it('filters DM_ONLY overrides from non-DM override:history responses', async () => {
      const { io } = createMockIo();
      const playerSocket = createMockSocket({ id: 'play-2', role: 'PLAYER', campaignId: 'camp-1' });
      registerOverrideHandlers(io, playerSocket);

      jest.spyOn(overrideService, 'getOverrideHistory').mockResolvedValue([
        {
          id: 'ov-secret',
          visibility: OverrideVisibility.DM_ONLY,
          reason: 'Fudged crit',
        } as never,
        {
          id: 'ov-public',
          visibility: OverrideVisibility.TABLE,
          reason: 'Rule of cool',
        } as never,
      ]);

      await Promise.all(
        playerSocket.listeners('override:history').map((fn) =>
          fn({ targetType: 'CHARACTER', targetId: 'char-1' })
        )
      );

      const resp = playerSocket.emitted.find((e) => e.event === 'override:history:response');
      expect(resp).toBeDefined();
      const payload = resp!.payload as { history: Array<{ id: string }> };
      expect(payload.history.map((h) => h.id)).toEqual(['ov-public']);
    });
  });
});
