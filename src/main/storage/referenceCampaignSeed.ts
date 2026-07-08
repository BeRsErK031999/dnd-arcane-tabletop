import { access, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  Asset,
  Campaign,
  CharacterCard,
  CombatState,
  Note,
  PlayerInitiativeTracker,
  PlayerSceneCanvasProjection,
  PlayerScreenState,
  Scene,
  SceneCanvasLayer,
  SceneCanvasMeasurement,
  SceneCanvasObject,
  SceneGrid,
} from '../../shared/types/index.js'
import type { StorageService } from './StorageService.js'

export const referenceCampaignId = 'campaign-reference-arcane-tabletop'

const referenceSeedMarkerFileName = '.reference-campaign-seeded'
const timestamp = '2026-07-08T00:00:00.000Z'
const sceneId = 'scene-reference-grotto'
const mapAssetId = 'asset-reference-grotto-map'
const handoutAssetId = 'asset-reference-merchant-letter'
const miraCardId = 'character-reference-mira'
const torenCardId = 'character-reference-toren'
const sellenCardId = 'character-reference-sellen'
const keeperCardId = 'character-reference-keeper'
const miraTokenId = 'object-reference-mira'
const torenTokenId = 'object-reference-toren'
const sellenTokenId = 'object-reference-sellen'
const keeperTokenId = 'object-reference-keeper'

export async function seedReferenceCampaign(
  storageService: StorageService,
  campaignsDirectory: string,
): Promise<void> {
  const markerFilePath = path.join(campaignsDirectory, referenceSeedMarkerFileName)

  if (await fileExists(markerFilePath)) {
    return
  }

  if ((await storageService.loadCampaign(referenceCampaignId)) === null) {
    await storageService.saveCampaign(createReferenceCampaign())
  }

  await writeFile(markerFilePath, `${new Date().toISOString()}\n`, 'utf8')
}

export function createReferenceCampaign(): Campaign {
  const assets = createReferenceAssets()
  const characterCards = createReferenceCharacterCards()
  const combatState = createReferenceCombatState()
  const scene = createReferenceScene()
  const sceneCanvas = createReferencePlayerSceneCanvas(scene, assets)
  const initiativeTracker = createReferenceInitiativeTracker(combatState)
  const playerScreenState: PlayerScreenState = {
    mode: 'scene',
    isHidden: false,
    title: scene.name,
    message: scene.description,
    scenePreview: {
      id: scene.id,
      name: scene.name,
      description: scene.description,
      locationLabel: 'Эталонная сцена',
    },
    sceneCanvas,
    handoutPreview: {
      id: handoutAssetId,
      name: 'Письмо торговца',
      description: 'Подготовленный handout для показа игрокам.',
      kind: 'handout',
      sourceLabel: 'Handout',
    },
    initiativeVisible: true,
    initiativeTracker,
    campaignId: referenceCampaignId,
    activeSceneId: scene.id,
    visibleTokenIds: [],
    revealedAssetIds: [mapAssetId, handoutAssetId],
    updatedAt: timestamp,
  }

  return {
    id: referenceCampaignId,
    name: 'Эталонная кампания: Грот Черной Луны',
    description: 'Готовый пример с картой, сценой, игроками, инициативой, заметками и handout.',
    createdAt: timestamp,
    updatedAt: timestamp,
    scenes: [scene],
    assets,
    characterCards,
    notes: createReferenceNotes(),
    combatState,
    playerScreenState,
  }
}

function createReferenceAssets(): Asset[] {
  return [
    {
      id: mapAssetId,
      campaignId: referenceCampaignId,
      kind: 'map',
      name: 'Карта грота',
      filePath: createSvgDataUrl(`
        <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
          <rect width="1600" height="900" fill="#1f2627"/>
          <path d="M90 676 C226 534 246 373 443 320 C604 276 712 177 904 212 C1097 247 1191 365 1390 327 L1510 770 L139 803 Z" fill="#384b4b"/>
          <path d="M193 648 C337 562 392 441 523 409 C677 372 798 270 934 307 C1071 344 1157 473 1348 438 L1404 691 L218 739 Z" fill="#5d756b"/>
          <path d="M0 0 H1600 V900 H0 Z" fill="none" stroke="#d8a86a" stroke-width="28" opacity=".26"/>
          <g stroke="#d8a86a" stroke-width="2" opacity=".18">
            <path d="M0 150 H1600"/><path d="M0 300 H1600"/><path d="M0 450 H1600"/><path d="M0 600 H1600"/><path d="M0 750 H1600"/>
            <path d="M200 0 V900"/><path d="M400 0 V900"/><path d="M600 0 V900"/><path d="M800 0 V900"/><path d="M1000 0 V900"/><path d="M1200 0 V900"/><path d="M1400 0 V900"/>
          </g>
          <circle cx="1120" cy="420" r="92" fill="#1b2c30" stroke="#86b7aa" stroke-width="8"/>
          <circle cx="1120" cy="420" r="28" fill="#8dc4b5"/>
          <path d="M395 602 L534 537 L666 573 L750 523" fill="none" stroke="#151719" stroke-width="34" stroke-linecap="round"/>
          <text x="72" y="92" fill="#fbfaf7" font-family="Segoe UI, Arial" font-size="44" font-weight="700">Грот Черной Луны</text>
          <text x="72" y="138" fill="#d8d0c3" font-family="Segoe UI, Arial" font-size="24">готовая карта для первого просмотра</text>
        </svg>
      `),
      tags: ['грот', 'карта', 'пример'],
      createdAt: timestamp,
      metadata: {
        generated: true,
        reference: true,
      },
    },
    {
      id: handoutAssetId,
      campaignId: referenceCampaignId,
      kind: 'handout',
      name: 'Письмо торговца',
      filePath: createSvgDataUrl(`
        <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
          <rect width="960" height="540" fill="#efe1c2"/>
          <path d="M106 74 H854 V466 H106 Z" fill="#f8edce" stroke="#8b6f43" stroke-width="10"/>
          <path d="M165 161 H795 M165 224 H795 M165 287 H648 M165 350 H742" stroke="#6d5635" stroke-width="14" stroke-linecap="round" opacity=".72"/>
          <circle cx="720" cy="372" r="50" fill="#9f2d3c" opacity=".88"/>
          <text x="154" y="120" fill="#4a3323" font-family="Segoe UI, Arial" font-size="34" font-weight="700">Письмо торговца</text>
          <text x="154" y="431" fill="#4a3323" font-family="Segoe UI, Arial" font-size="24">handout для демонстрации игрокам</text>
        </svg>
      `),
      tags: ['handout', 'письмо', 'пример'],
      createdAt: timestamp,
      metadata: {
        generated: true,
        reference: true,
      },
    },
  ]
}

function createReferenceCharacterCards(): CharacterCard[] {
  return [
    createCharacterCard(miraCardId, 'player', 'Мира Ворон', 'Анна', 'Следопыт, знает старую тропу к гроту.', 15, 24, 24, 3),
    createCharacterCard(torenCardId, 'player', 'Торен Камнерук', 'Илья', 'Воин с щитом и долгом перед караваном.', 18, 31, 31, 1),
    createCharacterCard(sellenCardId, 'npc', 'Селлен Тихий', undefined, 'Проводник, скрывает, что уже был в гроте.', 13, 18, 18, 2),
    createCharacterCard(keeperCardId, 'monster', 'Хранитель Луны', undefined, 'Главная угроза сцены. Реагирует на свет в центре грота.', 16, 42, 42, 4),
  ]
}

function createCharacterCard(
  id: string,
  kind: CharacterCard['kind'],
  name: string,
  playerName: string | undefined,
  description: string,
  armorClass: number,
  hitPointsCurrent: number,
  hitPointsMaximum: number,
  initiativeModifier: number,
): CharacterCard {
  return {
    id,
    campaignId: referenceCampaignId,
    kind,
    name,
    playerName,
    description,
    armorClass,
    hitPoints: {
      current: hitPointsCurrent,
      maximum: hitPointsMaximum,
    },
    initiativeModifier,
    notes: 'Эталонная карточка, можно редактировать или удалить.',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function createReferenceScene(): Scene {
  const grid = createReferenceGrid()
  const layers = createReferenceLayers()
  const objects = createReferenceObjects()
  const measurements = createReferenceMeasurements()

  return {
    id: sceneId,
    campaignId: referenceCampaignId,
    name: 'Засада у лунного алтаря',
    description: 'Готовая сцена с картой, туманом, токенами и измерениями для первого знакомства.',
    backgroundAssetId: mapAssetId,
    canvas: {
      width: 1600,
      height: 900,
      viewport: {
        zoom: 1,
        panX: 0,
        panY: 0,
      },
      layers,
      objects,
      measurements,
      fog: {
        enabled: true,
        opacity: 0.72,
        regions: [
          {
            id: 'fog-reference-alcove',
            shape: 'rectangle',
            label: 'Скрытая ниша',
            x: 960,
            y: 92,
            width: 360,
            height: 220,
          },
          {
            id: 'fog-reference-tunnel',
            shape: 'circle',
            label: 'Темный тоннель',
            x: 205,
            y: 210,
            width: 230,
            height: 230,
          },
        ],
      },
      updatedAt: timestamp,
    },
    tokens: [],
    grid,
    isActive: true,
  }
}

function createReferenceGrid(): SceneGrid {
  return {
    enabled: true,
    size: 70,
    color: '#d8a86a',
    opacity: 0.32,
    distancePerCell: 5,
    unitLabel: 'ft',
    snapToGrid: true,
  }
}

function createReferenceLayers(): SceneCanvasLayer[] {
  return [
    createLayer('scene-layer-map', 'map', 'Карта', 'player-visible', 0, true),
    createLayer('scene-layer-grid', 'grid', 'Сетка', 'player-visible', 10, true),
    createLayer('scene-layer-objects', 'object', 'Объекты', 'player-visible', 20, false),
    createLayer('scene-layer-tokens', 'token', 'Токены', 'player-visible', 30, false),
    createLayer('scene-layer-master', 'master', 'Слой мастера', 'master-only', 40, false),
    createLayer('scene-layer-fog', 'fog', 'Туман войны', 'player-visible', 50, true, 0),
  ]
}

function createLayer(
  id: string,
  kind: SceneCanvasLayer['kind'],
  name: string,
  visibility: SceneCanvasLayer['visibility'],
  zIndex: number,
  locked: boolean,
  opacity = 1,
): SceneCanvasLayer {
  return {
    id,
    kind,
    name,
    visibility,
    zIndex,
    opacity,
    locked,
  }
}

function createReferenceObjects(): SceneCanvasObject[] {
  return [
    createTokenObject(miraTokenId, 'Мира', 420, 565, '#2c806f', miraCardId, 24, 15),
    createTokenObject(torenTokenId, 'Торен', 500, 565, '#49625f', torenCardId, 31, 18),
    createTokenObject(sellenTokenId, 'Селлен', 580, 635, '#8b7a5a', sellenCardId, 18, 13),
    createTokenObject(keeperTokenId, 'Хранитель', 1090, 395, '#9f2d3c', keeperCardId, 42, 16),
    {
      id: 'object-reference-note',
      layerId: 'scene-layer-master',
      kind: 'note',
      name: 'Секрет алтаря',
      x: 1140,
      y: 312,
      width: 210,
      height: 90,
      rotation: 0,
      color: '#d8a86a',
      text: 'Алтарь гаснет, если закрыть три руны.',
      isPlayerVisible: false,
    },
  ]
}

function createTokenObject(
  id: string,
  name: string,
  x: number,
  y: number,
  color: string,
  characterCardId: string,
  hitPoints: number,
  armorClass: number,
): SceneCanvasObject {
  return {
    id,
    layerId: 'scene-layer-tokens',
    kind: 'token-placeholder',
    name,
    x,
    y,
    width: 70,
    height: 70,
    rotation: 0,
    color,
    text: name,
    tokenState: {
      characterCardId,
      hitPoints,
      armorClass,
    },
    isPlayerVisible: true,
  }
}

function createReferenceMeasurements(): SceneCanvasMeasurement[] {
  return [
    {
      id: 'measurement-reference-approach',
      kind: 'ruler',
      name: 'Дистанция до алтаря',
      originX: 530,
      originY: 600,
      targetX: 1070,
      targetY: 430,
      radius: 0,
      color: '#2c806f',
      label: '40 ft',
      isPlayerVisible: true,
    },
    {
      id: 'measurement-reference-aura',
      kind: 'area',
      shape: 'circle',
      name: 'Лунная аура',
      originX: 1120,
      originY: 420,
      targetX: 1120,
      targetY: 420,
      radius: 170,
      color: '#d8a86a',
      label: '20 ft',
      isPlayerVisible: true,
    },
  ]
}

function createReferenceCombatState(): CombatState {
  return {
    campaignId: referenceCampaignId,
    isActive: true,
    round: 1,
    turnIndex: 0,
    participants: [
      {
        id: 'combat-reference-keeper',
        name: 'Хранитель Луны',
        initiative: 18,
        characterCardId: keeperCardId,
        isPlayerControlled: false,
        isDefeated: false,
      },
      {
        id: 'combat-reference-mira',
        name: 'Мира Ворон',
        initiative: 16,
        characterCardId: miraCardId,
        isPlayerControlled: true,
        isDefeated: false,
      },
      {
        id: 'combat-reference-sellen',
        name: 'Селлен Тихий',
        initiative: 14,
        characterCardId: sellenCardId,
        isPlayerControlled: false,
        isDefeated: false,
      },
      {
        id: 'combat-reference-toren',
        name: 'Торен Камнерук',
        initiative: 11,
        characterCardId: torenCardId,
        isPlayerControlled: true,
        isDefeated: false,
      },
    ],
  }
}

function createReferenceNotes(): Note[] {
  return [
    {
      id: 'note-reference-master-secret',
      campaignId: referenceCampaignId,
      title: 'Секрет алтаря',
      body: 'Если герои перекроют свет от трех рун, Хранитель теряет защиту до конца раунда.',
      scope: 'master',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'note-reference-player-handout',
      campaignId: referenceCampaignId,
      title: 'Письмо торговца',
      body: 'Караван пропал у грота после полуночи. На камнях остался знак черной луны.',
      scope: 'players',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]
}

function createReferencePlayerSceneCanvas(scene: Scene, assets: Asset[]): PlayerSceneCanvasProjection {
  const mapAsset = assets.find((asset) => asset.id === mapAssetId)

  return {
    width: scene.canvas.width,
    height: scene.canvas.height,
    viewport: { ...scene.canvas.viewport },
    grid: { ...scene.grid },
    backgroundAsset: mapAsset
      ? {
          id: mapAsset.id,
          name: mapAsset.name,
          filePath: mapAsset.filePath,
        }
      : undefined,
    layers: scene.canvas.layers
      .filter((layer) => layer.visibility === 'player-visible')
      .map((layer) => ({
        id: layer.id,
        kind: layer.kind,
        name: layer.name,
        zIndex: layer.zIndex,
        opacity: layer.opacity,
      })),
    objects: scene.canvas.objects
      .filter((object) => object.isPlayerVisible)
      .map(({ id, kind, name, x, y, width, height, rotation, color, text, assetId }) => ({
        id,
        kind,
        name,
        x,
        y,
        width,
        height,
        rotation,
        color,
        text,
        assetId,
      })),
    measurements: scene.canvas.measurements
      .filter((measurement) => measurement.isPlayerVisible)
      .map(({ id, kind, shape, name, originX, originY, targetX, targetY, radius, color, label }) => ({
        id,
        kind,
        shape,
        name,
        originX,
        originY,
        targetX,
        targetY,
        radius,
        color,
        label,
      })),
    fog: {
      enabled: scene.canvas.fog.enabled,
      opacity: scene.canvas.fog.opacity,
      regions: scene.canvas.fog.regions.map(({ id, shape, x, y, width, height }) => ({
        id,
        shape,
        x,
        y,
        width,
        height,
      })),
    },
    updatedAt: scene.canvas.updatedAt,
  }
}

function createReferenceInitiativeTracker(combatState: CombatState): PlayerInitiativeTracker {
  return {
    isActive: combatState.isActive,
    round: combatState.round,
    turnIndex: combatState.turnIndex,
    participants: combatState.participants.map((participant, index) => ({
      id: participant.id,
      name: participant.name,
      initiative: participant.initiative,
      isActive: combatState.isActive && index === combatState.turnIndex,
      isPlayerControlled: participant.isPlayerControlled,
      isDefeated: participant.isDefeated,
    })),
  }
}

function createSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
