import { WebSocketManager } from '../src/ts/network/webSocketManager';

// Interface for mocked globals
interface MockedGlobals {
  Roll: jest.Mock;
  ChatMessage: { create: jest.Mock };
  fromUuid: jest.Mock;
  game: {
    user: { id: string; isGM: boolean };
    settings: { get: jest.Mock };
  };
  CONST: {
    DICE_ROLL_MODES: {
      PUBLIC: string;
      PRIVATE: string;
    };
  };
}

// Mock dependencies

// Setup mocked globals
const mockedGlobals: MockedGlobals = {
  Roll: jest.fn().mockImplementation(() => ({
    evaluate: jest.fn().mockResolvedValue({}),
    total: 10,
    terms: [{ results: [{ result: 5 }] }],
    dice: [{ faces: 6, results: [{ result: 5, active: true }] }],
    toMessage: jest.fn().mockResolvedValue({}),
  })),
  ChatMessage: {
    create: jest.fn().mockResolvedValue({ id: 'mockMessageId' }),
  },
  fromUuid: jest.fn().mockResolvedValue(null),
  game: {
    user: { id: 'userId', isGM: true },
    settings: {
      get: jest.fn().mockReturnValue({}),
    },
  },
  CONST: {
    DICE_ROLL_MODES: {
      PUBLIC: 'publicroll',
      PRIVATE: 'gmroll',
    },
  },
};

// Assign mocked globals
Object.assign(global, mockedGlobals, { Hooks: { once: jest.fn(), off: jest.fn() } });
const { routers } = require('../src/ts/network/routers/all') as typeof import('../src/ts/network/routers/all');

describe('WebSocket Routes', () => {
  let mockSocketManager: jest.Mocked<WebSocketManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocketManager = {
      send: jest.fn(),
      onMessageType: jest.fn(),
    } as unknown as jest.Mocked<WebSocketManager>;
    
    routers.forEach(router => router.reflect(mockSocketManager));
  });

  test('all routes exist', () => {
    const expectedRoutes = ['actors', 'actors-detail', 'items', 'items-detail', 'world', 'ping', 'pong', 'entity', 'create', 'decrease', 'increase', 'update', 'delete', 'kill', 'give', 'remove', 'encounters', 'start-encounter', 'next-turn', 'next-round', 'last-turn', 'last-round', 'end-encounter', 'add-to-encounter', 'remove-from-encounter', 'rolls', 'last-roll', 'roll', 'search', 'structure', 'get-folder', 'create-folder', 'delete-folder', 'contents', 'macros', 'macro-execute', 'execute-js', 'players', 'world-info', 'server-url', 'select', 'selected', 'file-system', 'upload-file', 'download-file', 'get-scene', 'create-scene', 'update-scene', 'delete-scene', 'switch-scene', 'get-canvas-documents', 'create-canvas-document', 'update-canvas-document', 'delete-canvas-document', 'move-token', 'measure-distance', 'chat-messages', 'chat-send', 'chat-delete', 'chat-flush', 'get-status-effects', 'sheet-screenshot', 'interactive-session-start', 'interactive-input', 'interactive-session-end', 'get-playlists', 'playlist-play', 'playlist-stop', 'playlist-next', 'playlist-volume', 'stop-sound', 'play-sound', 'scene-screenshot', 'scene-raw-image', 'get-users', 'get-user', 'create-user', 'update-user', 'delete-user', 'transfer-result', 'remote-response'];
    const registered = mockSocketManager.onMessageType.mock.calls.map(call => call[0]);
    expect(registered.sort()).toEqual(expectedRoutes.sort());
    expect(new Set(registered).size).toBe(registered.length);
  });
});
