import { shell, dialog, ipcMain, IpcMainInvokeEvent, app, IpcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';

import ModUtils, { Mod } from '../../mod-utils';
import store from '../../store';
import downloadsStore from '../../store-downloads';
import ProtocolHandler from '../../protocol-handler';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import FppHandler from '../../fpp-handler';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';
import {
  ModScanner,
  PathData,
  ScanModResult,
} from '../../mod-utils/mod-scanner';
import {
  EchoOperationOptions,
  SlotChanger,
  SlotCustomNamesByFighter,
  UiCompatibilityCategory,
} from '../../mod-utils/slot-changer';
import { UiCharaDbBinaryService } from '../../mod-utils/ui-chara-db-prc';
import { PATHS } from '../../config';

export type ModHandlers = typeof ModHandlers;

type EchoTakenName = {
  name: string;
  modName: string;
  modPath: string;
};

type EchoModEligibility = {
  isEligible: boolean;
  reason: string;
  category: string | null;
};

type EchoUiCompatibilityCategoryPlan = {
  key: UiCompatibilityCategory;
  defaultEnabled: boolean;
  defaultTargetPath: string | null;
  defaultSourcePath: string | null;
};

type EchoUiCompatibilityCandidate = {
  name: string;
  path: string;
  status: string;
  signatures: {
    slotExpansionData: boolean;
    cssLayout: boolean;
    menuParams: boolean;
  };
};

type EchoUiCompatibilityPlan = {
  selectedModPath: string;
  profile: 'expanded-slots-theme-split' | 'single-mod-fallback';
  categories: EchoUiCompatibilityCategoryPlan[];
  candidates: EchoUiCompatibilityCandidate[];
  recommendedTargets: {
    slotExpansionTargetPath: string;
    uiThemeSourcePath: string | null;
    uiMergeTargetPath: string;
  };
  notes: string[];
};

type EchoUiCharaStructInspector = {
  sourcePath: string;
  fighterName: string;
  fighterIndex: number;
  fields: Record<string, string>;
  nameOptions: EchoUiNameOption[];
};

type EchoUiNameOption = {
  slot: string;
  labelIndex: string;
  namChr0: string;
  namChr1: string;
  namChr2: string;
  namChr3: string;
  namStageName: string;
  announcer: string;
};

type UiBuilderCategory =
  | 'backgrounds'
  | 'fonts'
  | 'borders'
  | 'images'
  | 'animations';

type UiBuilderModAnalysis = {
  name: string;
  path: string;
  status: string;
  category: string | null;
  categories: UiBuilderCategory[];
  categoryMatches: Record<UiBuilderCategory, string[]>;
  uiFiles: string[];
};

type UiBuilderAnalyzeResponse = {
  modsPath: string;
  mods: UiBuilderModAnalysis[];
};

type UiBuilderBuildRequest = {
  outputFolderName?: string;
  categorySelections: Partial<Record<UiBuilderCategory, string>>;
};

type UiBuilderSkippedConflict = {
  relativePath: string;
  existingModPath: string;
  skippedModPath: string;
  category: UiBuilderCategory;
};

type UiBuilderBuildResponse = {
  outputPath: string;
  copiedFiles: string[];
  skippedConflicts: UiBuilderSkippedConflict[];
  selectedCategories: UiBuilderCategory[];
};

const SLOT_EXPANSION_SIGNATURES = [
  'ui/param/database/ui_chara_db.prcxml',
  'ui/message/msg_name.xmsbt',
  'ui/param/database/ui_chara_db.prc',
  'ui/message/msg_name.msbt',
];

const CSS_LAYOUT_SIGNATURES = [
  'ui/layout/menu/chara_select/chara_select/layout.arc',
  'ui/layout/menu/compe_chara_select/compe_chara_select/layout.arc',
  'ui/layout/menu/select_bg/select_bg/layout.arc',
  'ui/layout/menu/title/title/layout.arc',
];

const MENU_PARAM_SIGNATURES = [
  'param/menu/chara_icon_arrangement.prc',
  'param/menu/chara_icon_arrangement.prcx',
];

const UI_BUILDER_CATEGORIES: UiBuilderCategory[] = [
  'backgrounds',
  'fonts',
  'borders',
  'images',
  'animations',
];

const UI_BUILDER_CATEGORY_PATTERNS: Record<UiBuilderCategory, RegExp[]> = {
  backgrounds: [
    /(^|\/)ui\/layout\/menu\/(select_bg|title|stage_select|result)(\/|$)/i,
    /(^|\/)background/i,
    /(^|\/)bg(_|\/|\.)/i,
  ],
  fonts: [
    /(^|\/)font(s)?(\/|_|\.)/i,
    /typeface/i,
    /(^|\/)ui\/message\//i,
  ],
  borders: [
    /(^|\/)border(s)?(\/|_|\.)/i,
    /(^|\/)frame(s)?(\/|_|\.)/i,
    /(^|\/)window(s)?(\/|_|\.)/i,
    /(^|\/)plate(s)?(\/|_|\.)/i,
  ],
  images: [
    /(^|\/)ui\/replace\//i,
    /(^|\/)icon(s)?(\/|_|\.)/i,
    /(^|\/)portrait(s)?(\/|_|\.)/i,
    /(^|\/)image(s)?(\/|_|\.)/i,
    /texture/i,
  ],
  animations: [
    /(^|\/)anim(ation)?(s)?(\/|_|\.)/i,
    /(^|\/)motion(\/|_|\.)/i,
    /(^|\/)movie(s)?(\/|_|\.)/i,
    /(^|\/)timeline(s)?(\/|_|\.)/i,
    /(^|\/)effect(s)?(\/|_|\.)/i,
  ],
};

function isUiRelatedRelativeFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  return normalized.startsWith('ui/') || normalized.startsWith('param/menu/');
}

function listRelativeFilesRecursive(basePath: string): string[] {
  if (!fs.existsSync(basePath)) {
    return [];
  }

  const results: string[] = [];

  const walk = (absolutePath: string, relativePrefix: string) => {
    const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      const entryAbsolutePath = path.join(absolutePath, entry.name);
      const entryRelativePath = relativePrefix
        ? `${relativePrefix}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        walk(entryAbsolutePath, entryRelativePath);
      } else if (entry.isFile()) {
        results.push(entryRelativePath.replace(/\\/g, '/'));
      }
    }
  };

  walk(basePath, '');
  return results;
}

function buildUiBuilderModAnalysis(mod: Mod): UiBuilderModAnalysis {
  const allFiles = listRelativeFilesRecursive(mod.path);
  const uiFiles = allFiles
    .filter((relativePath) => isUiRelatedRelativeFile(relativePath))
    .sort((a, b) => a.localeCompare(b));

  const categoryMatches: Record<UiBuilderCategory, string[]> = {
    backgrounds: [],
    fonts: [],
    borders: [],
    images: [],
    animations: [],
  };

  for (const relativePath of uiFiles) {
    for (const category of UI_BUILDER_CATEGORIES) {
      const patterns = UI_BUILDER_CATEGORY_PATTERNS[category];
      if (patterns.some((pattern) => pattern.test(relativePath))) {
        categoryMatches[category].push(relativePath);
      }
    }
  }

  const categories = UI_BUILDER_CATEGORIES.filter(
    (category) => categoryMatches[category].length > 0,
  );

  return {
    name: mod.name,
    path: mod.path,
    status: mod.status,
    category: ModUtils.readModInfo(mod.path)?.category || null,
    categories,
    categoryMatches,
    uiFiles,
  };
}

const CHARACTER_IMAGE_TIMEOUT_MS = 12000;
const characterImageDownloadPromises = new Map<string, Promise<string | null>>();

const MAX_ECHO_NAME_LENGTH = 10;
const ECHO_LAYOUT_STATE_RELATIVE_PATH = '.fightplanner/echo-layout-state.json';

function normalizeEchoName(value: string): string {
  return toEchoToken(value);
}

function toEchoToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, MAX_ECHO_NAME_LENGTH);
}

type EchoLayoutStatePayload = {
  characterOrder?: string[];
  selectedCharacter?: string | null;
  updatedAt?: string;
};

function getEchoLayoutStatePath(slotTargetModPath: string): string {
  return path.join(slotTargetModPath, ECHO_LAYOUT_STATE_RELATIVE_PATH);
}

async function loadEchoLayoutState(
  slotTargetModPath: string,
): Promise<EchoLayoutStatePayload | null> {
  if (!slotTargetModPath || !fs.existsSync(slotTargetModPath)) {
    return null;
  }

  const statePath = getEchoLayoutStatePath(slotTargetModPath);

  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const raw = await fs.promises.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw) as EchoLayoutStatePayload;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      characterOrder: Array.isArray(parsed.characterOrder)
        ? parsed.characterOrder
        : undefined,
      selectedCharacter:
        typeof parsed.selectedCharacter === 'string' ||
        parsed.selectedCharacter === null
          ? parsed.selectedCharacter
          : undefined,
      updatedAt:
        typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch (error) {
    return null;
  }
}

async function saveEchoLayoutState(
  slotTargetModPath: string,
  payload: EchoLayoutStatePayload,
): Promise<boolean> {
  if (!slotTargetModPath || !fs.existsSync(slotTargetModPath)) {
    return false;
  }

  const statePath = getEchoLayoutStatePath(slotTargetModPath);

  try {
    await fs.promises.mkdir(path.dirname(statePath), { recursive: true });
    await fs.promises.writeFile(
      statePath,
      JSON.stringify(
        {
          characterOrder: Array.isArray(payload.characterOrder)
            ? payload.characterOrder
            : [],
          selectedCharacter:
            typeof payload.selectedCharacter === 'string' ||
            payload.selectedCharacter === null
              ? payload.selectedCharacter
              : null,
          updatedAt: payload.updatedAt || new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    );

    return true;
  } catch (error) {
    return false;
  }
}

function splitWords(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[\\/_.-]/g, ' ')
    .split(/\s+/g)
    .filter(Boolean);
}

function extractThemeWordCandidates(
  seedValues: string[],
  excludedTokens: Set<string>,
): string[] {
  const stopWords = new Set([
    'alt',
    'alternate',
    'anime',
    'audio',
    'bank',
    'bgm',
    'body',
    'character',
    'chara',
    'color',
    'colours',
    'colors',
    'costume',
    'def',
    'effect',
    'effects',
    'fighter',
    'fighters',
    'file',
    'files',
    'final',
    'mesh',
    'mod',
    'model',
    'mods',
    'moveset',
    'movesets',
    'music',
    'nus3audio',
    'nus3bank',
    'pack',
    'patch',
    'portrait',
    'replace',
    'reskin',
    'slot',
    'smash',
    'sound',
    'stage',
    'stages',
    'texture',
    'textures',
    'ui',
    'voice',
    'webp',
    'xmsbt',
    'xml',
    'fighter',
    'skin',
  ]);

  const words = new Set<string>();

  for (const value of seedValues) {
    for (const part of splitWords(value)) {
      if (/^\d+$/.test(part)) {
        if (part === '64') {
          words.add('retro');
          words.add('classic');
        }
        continue;
      }

      const token = toEchoToken(part);
      if (!token) continue;
      if (token.length < 3) continue;
      if (/^c\d{2,3}$/.test(token)) continue;
      if (stopWords.has(token)) continue;
      if (excludedTokens.has(token)) continue;
      words.add(token);
    }
  }

  return Array.from(words);
}

function fallbackEchoNameFromSeeds(
  seedValues: string[],
  excludedTokens: Set<string>,
): string {
  const candidates = extractThemeWordCandidates(seedValues, excludedTokens);
  if (candidates.length > 0) {
    return candidates[0];
  }

  return 'echoform';
}

function detectEchoFromScanResult(scanResult: ScanModResult): boolean {
  const hasHighSlot = scanResult.currentSlots.some((slot) => {
    if (!/^c\d{2,3}$/i.test(slot)) return false;
    return parseInt(slot.replace('c', ''), 10) > 7;
  });

  if (hasHighSlot) {
    return true;
  }

  const hasEchoMetadataInUnknown = scanResult.unknownFiles.some((filePath) => {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    return (
      normalizedPath.endsWith('ui/message/msg_name.xmsbt') ||
      normalizedPath.endsWith('ui/param/database/ui_chara_db.prcxml') ||
      normalizedPath.endsWith('ui/message/msg_name.msbt') ||
      normalizedPath.endsWith('ui/param/database/ui_chara_db.prc')
    );
  });

  return hasEchoMetadataInUnknown;
}

function hasAnySignatureFile(modPath: string, relativePaths: string[]): boolean {
  if (!modPath) {
    return false;
  }

  return relativePaths.some((relativePath) => {
    const fullPath = path.join(modPath, relativePath);
    return fs.existsSync(fullPath);
  });
}

function buildUiCompatibilityCandidate(
  mod: Mod,
): EchoUiCompatibilityCandidate | null {
  if (!mod.path || !fs.existsSync(mod.path)) {
    return null;
  }

  return {
    name: mod.name,
    path: mod.path,
    status: mod.status,
    signatures: {
      slotExpansionData: hasAnySignatureFile(mod.path, SLOT_EXPANSION_SIGNATURES),
      cssLayout: hasAnySignatureFile(mod.path, CSS_LAYOUT_SIGNATURES),
      menuParams: hasAnySignatureFile(mod.path, MENU_PARAM_SIGNATURES),
    },
  };
}

function hasUiCompatibilitySignature(candidate: EchoUiCompatibilityCandidate): boolean {
  return (
    candidate.signatures.slotExpansionData ||
    candidate.signatures.cssLayout ||
    candidate.signatures.menuParams
  );
}

function hasFighterAssets(modPath: string): boolean {
  return fs.existsSync(path.join(modPath, 'fighter'));
}

function isUiOnlyCompatibilityCandidate(
  candidate: EchoUiCompatibilityCandidate,
): boolean {
  return hasUiCompatibilitySignature(candidate) && !hasFighterAssets(candidate.path);
}

function getCharacterImageCacheDir() {
  return path.join(app.getPath('userData'), 'character-images');
}

function downloadCharacterImage(
  remoteUrl: string,
  destinationPath: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(remoteUrl);
    const transport = parsedUrl.protocol === 'http:' ? http : https;

    const request = transport.get(remoteUrl, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        resolve(false);
        return;
      }

      const contentType = `${response.headers['content-type'] || ''}`.toLowerCase();
      if (!contentType.startsWith('image/')) {
        response.resume();
        resolve(false);
        return;
      }

      const output = fs.createWriteStream(destinationPath);

      response.pipe(output);

      output.on('finish', () => {
        output.close();
        resolve(true);
      });

      output.on('error', () => {
        output.close();
        resolve(false);
      });
    });

    request.setTimeout(CHARACTER_IMAGE_TIMEOUT_MS, () => {
      request.destroy();
      resolve(false);
    });

    request.on('error', () => {
      resolve(false);
    });
  });
}

async function resolveCharacterImageUrl(
  fighterKey: string,
  remoteUrl: string,
): Promise<string | null> {
  if (!fighterKey) {
    return null;
  }

  const safeKey = fighterKey.replace(/[^a-z0-9_-]/gi, '').toLowerCase();
  if (!safeKey) {
    return null;
  }

  const localImageCandidates: string[] = [];
  const candidateNames = [
    `chara_7_${safeKey}_00.png`,
    `chara_7_${safeKey}_first_00.png`,
  ];

  const appAssetPortraitDir = path.join(
    app.getAppPath(),
    'assets',
    'images',
    'chara',
  );

  for (const candidateName of candidateNames) {
    localImageCandidates.push(path.join(appAssetPortraitDir, candidateName));
  }

  for (const candidatePath of localImageCandidates) {
    if (fs.existsSync(candidatePath)) {
      return ModUtils.pathToFileUrl(candidatePath);
    }
  }

  const cacheDir = getCharacterImageCacheDir();
  const cachePath = path.join(cacheDir, `${safeKey}.png`);

  if (fs.existsSync(cachePath)) {
    return ModUtils.pathToFileUrl(cachePath);
  }

  if (!remoteUrl) {
    return null;
  }

  const existingPromise = characterImageDownloadPromises.get(safeKey);
  if (existingPromise) {
    return remoteUrl;
  }

  const downloadPromise: Promise<string | null> = (async () => {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });

      const downloaded = await downloadCharacterImage(remoteUrl, cachePath);
      if (!downloaded) {
        return null;
      }

      return ModUtils.pathToFileUrl(cachePath);
    } catch (error) {
      return null;
    } finally {
      characterImageDownloadPromises.delete(safeKey);
    }
  })();

  characterImageDownloadPromises.set(safeKey, downloadPromise);
  return remoteUrl;
}

async function resolveFighterIndex(fighterName: string): Promise<number> {
  const namesDataPath = path.join(PATHS.dataDir(), 'names.data');
  const namesData = await fs.promises.readFile(namesDataPath, 'utf8');

  for (const line of namesData.split(/\r?\n/)) {
    const parts = line.split(',').map((value) => value.trim());
    if (parts.length < 3) continue;

    if (parts[0].toLowerCase() === fighterName.trim().toLowerCase()) {
      const index = parseInt(parts[2], 10);
      if (!Number.isNaN(index)) {
        return index;
      }
    }
  }

  throw new Error(`Fighter name \"${fighterName}\" not found in names.data`);
}

function extractHashFieldsFromStruct(structXml: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const fieldRegex =
    /<(byte|sbyte|short|int|float|hash40|string|bool)\s+hash="([^"]+)">([\s\S]*?)<\/\1>/g;

  let match: RegExpExecArray | null;
  while ((match = fieldRegex.exec(structXml)) !== null) {
    const hashName = match[2]?.trim();
    if (!hashName) continue;
    fields[hashName] = (match[3] || '').trim();
  }

  return fields;
}

function decodeXmlEntities(value: string): string {
  if (!value) {
    return '';
  }

  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function normalizeMessageLabelSuffix(value: string): string {
  return `${value || ''}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

function extractMsgNameEntries(xmlContent: string): Map<string, string> {
  const entries = new Map<string, string>();
  if (!xmlContent) {
    return entries;
  }

  const entryRegex =
    /<entry\s+label="([^"]+)">[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<\/entry>/g;

  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(xmlContent)) !== null) {
    const label = `${match[1] || ''}`.trim();
    if (!label) {
      continue;
    }

    entries.set(label, decodeXmlEntities((match[2] || '').trim()));
  }

  return entries;
}

function parseNumericField(value: string | undefined): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function findMsgEntry(
  entries: Map<string, string>,
  baseLabel: string,
  labelIndex: number,
  suffix: string,
): string {
  if (!suffix) {
    return '';
  }

  const paddedIndex = String(labelIndex).padStart(2, '0');
  const unpaddedIndex = String(labelIndex);

  return (
    entries.get(`${baseLabel}_${paddedIndex}_${suffix}`) ||
    entries.get(`${baseLabel}_${unpaddedIndex}_${suffix}`) ||
    ''
  );
}

function buildUiNameOptions(
  fields: Record<string, string>,
  msgEntries: Map<string, string>,
  preferredSuffix: string,
  fallbackSuffix: string,
): EchoUiNameOption[] {
  const slotEntries: { slotNum: number; slotCode: string; labelIndex: number }[] = [];

  for (const fieldName of Object.keys(fields)) {
    const match = /^n(\d{2,3})_index$/i.exec(fieldName);
    if (!match) {
      continue;
    }

    const slotNum = parseInt(match[1], 10);
    if (Number.isNaN(slotNum)) {
      continue;
    }

    const nIndexValue = parseNumericField(fields[fieldName]);
    const labelIndex = nIndexValue !== null && nIndexValue > 0 ? nIndexValue : 8;

    slotEntries.push({
      slotNum,
      slotCode: String(slotNum).padStart(2, '0'),
      labelIndex,
    });
  }

  if (slotEntries.length === 0) {
    slotEntries.push({
      slotNum: 0,
      slotCode: '00',
      labelIndex: 8,
    });
  }

  slotEntries.sort((a, b) => a.slotNum - b.slotNum);

  return slotEntries.map((slotEntry) => {
    const findValue = (baseLabel: string): string => {
      const fromPreferred = findMsgEntry(
        msgEntries,
        baseLabel,
        slotEntry.labelIndex,
        preferredSuffix,
      );

      if (fromPreferred) {
        return fromPreferred;
      }

      if (!fallbackSuffix || fallbackSuffix === preferredSuffix) {
        return '';
      }

      return findMsgEntry(
        msgEntries,
        baseLabel,
        slotEntry.labelIndex,
        fallbackSuffix,
      );
    };

    const cIndexValue = parseNumericField(fields[`c${slotEntry.slotCode}_index`]);
    const announcerIndex = cIndexValue !== null && cIndexValue >= 0 ? cIndexValue : 0;
    const announcerHash = `characall_label_c${String(announcerIndex).padStart(2, '0')}`;
    const announcer = fields[announcerHash] || fields.characall_label_c00 || '';

    return {
      slot: `c${slotEntry.slotCode}`,
      labelIndex: String(slotEntry.labelIndex).padStart(2, '0'),
      namChr0: findValue('nam_chr0'),
      namChr1: findValue('nam_chr1'),
      namChr2: findValue('nam_chr2'),
      namChr3: findValue('nam_chr3'),
      namStageName: findValue('nam_stage_name'),
      announcer,
    };
  });
}

async function readUiCharaStructInspector(
  slotTargetModPath: string,
  fighterName: string,
): Promise<EchoUiCharaStructInspector | null> {
  if (!slotTargetModPath || !fighterName || !fs.existsSync(slotTargetModPath)) {
    return null;
  }

  const prcxmlPath = path.join(
    slotTargetModPath,
    'ui',
    'param',
    'database',
    'ui_chara_db.prcxml',
  );

  const fighterIndex = await resolveFighterIndex(fighterName);
  let sourcePath = prcxmlPath;
  let fields: Record<string, string> | null = null;

  if (fs.existsSync(prcxmlPath)) {
    const xmlContent = await fs.promises.readFile(prcxmlPath, 'utf8');

    const structRegex = new RegExp(
      `<struct\\s+index="${fighterIndex}"[\\s\\S]*?<\\/struct>`,
      'i',
    );
    const structMatch = xmlContent.match(structRegex);

    if (structMatch) {
      fields = extractHashFieldsFromStruct(structMatch[0]);
    }
  }

  if (!fields) {
    const binaryStruct = await UiCharaDbBinaryService.readStructFields(
      slotTargetModPath,
      fighterIndex,
    );

    if (!binaryStruct) {
      return null;
    }

    fields = binaryStruct.fields;
    sourcePath = binaryStruct.sourcePath;
  }

  const msgNamePath = path.join(slotTargetModPath, 'ui', 'message', 'msg_name.xmsbt');
  let msgEntries = new Map<string, string>();

  if (fs.existsSync(msgNamePath)) {
    const msgContent = await fs.promises.readFile(msgNamePath, 'utf8');
    msgEntries = extractMsgNameEntries(msgContent);
  }

  const preferredSuffix = normalizeMessageLabelSuffix(fields.name_id || fighterName);
  const fallbackSuffix = normalizeMessageLabelSuffix(fighterName);

  return {
    sourcePath,
    fighterName,
    fighterIndex,
    fields,
    nameOptions: buildUiNameOptions(
      fields,
      msgEntries,
      preferredSuffix,
      fallbackSuffix,
    ),
  };
}

function resolveUiCompatibilityPlan(
  selectedModPath: string,
  selectedModName: string,
  mods: Mod[],
): EchoUiCompatibilityPlan {
  const candidateMap = new Map<string, EchoUiCompatibilityCandidate>();

  for (const mod of mods) {
    const candidate = buildUiCompatibilityCandidate(mod);

    if (candidate) {
      candidateMap.set(candidate.path, candidate);
    }
  }

  if (!candidateMap.has(selectedModPath) && fs.existsSync(selectedModPath)) {
    const fallbackMod: Mod = {
      name: selectedModName || path.basename(selectedModPath),
      path: selectedModPath,
      status: 'active',
    };

    const fallbackCandidate = buildUiCompatibilityCandidate(fallbackMod);

    if (fallbackCandidate) {
      candidateMap.set(selectedModPath, fallbackCandidate);
    }
  }

  const allCandidates = Array.from(candidateMap.values());
  let candidates = allCandidates.filter((candidate) =>
    isUiOnlyCompatibilityCandidate(candidate),
  );

  // Preserve a usable fallback when no UI-only signatures are detected at all.
  if (candidates.length === 0) {
    candidates = [];
  }

  const knownSlotsMod = candidates.find((candidate) => {
    return (
      candidate.name.toLowerCase().includes('css 91-255 slots') ||
      candidate.signatures.slotExpansionData
    );
  });

  const firstSlotsCandidate = candidates.find(
    (candidate) => candidate.signatures.slotExpansionData,
  );

  const slotExpansionTargetPath =
    knownSlotsMod?.path ||
    firstSlotsCandidate?.path ||
    candidates[0]?.path ||
    selectedModPath;

  const themeCandidates = candidates
    .filter((candidate) => {
      return (
        candidate.path !== slotExpansionTargetPath &&
        (candidate.signatures.cssLayout || candidate.signatures.menuParams)
      );
    })
    .sort((a, b) => {
      const aScore =
        (a.signatures.cssLayout ? 2 : 0) + (a.signatures.menuParams ? 1 : 0);
      const bScore =
        (b.signatures.cssLayout ? 2 : 0) + (b.signatures.menuParams ? 1 : 0);

      return bScore - aScore;
    });

  const uiThemeSourcePath = themeCandidates[0]?.path || null;
  const uiMergeTargetPath = slotExpansionTargetPath;

  const categories: EchoUiCompatibilityCategoryPlan[] = [
    {
      key: 'slotExpansionData',
      defaultEnabled: true,
      defaultTargetPath: slotExpansionTargetPath,
      defaultSourcePath: selectedModPath,
    },
    {
      key: 'cssLayout',
      defaultEnabled: Boolean(uiThemeSourcePath),
      defaultTargetPath: uiMergeTargetPath,
      defaultSourcePath: uiThemeSourcePath,
    },
    {
      key: 'menuParams',
      defaultEnabled: Boolean(uiThemeSourcePath),
      defaultTargetPath: uiMergeTargetPath,
      defaultSourcePath: uiThemeSourcePath,
    },
  ];

  const notes: string[] = [];

  if (candidates.length === 0) {
    notes.push(
      'No UI-only compatibility candidates were detected. Select or install a dedicated CSS/UI mod to enable planner routing.',
    );
  }

  if (slotExpansionTargetPath !== selectedModPath) {
    notes.push(
      'Slot expansion metadata is routed to a dedicated slots UI mod by default.',
    );
  }

  if (!uiThemeSourcePath) {
    notes.push(
      'No separate active theme UI mod was detected; CSS/layout categories are disabled by default.',
    );
  } else {
    notes.push(
      'Theme UI files can be merged into the slot target mod to avoid live mod stacking conflicts.',
    );
  }

  const profile = uiThemeSourcePath
    ? 'expanded-slots-theme-split'
    : 'single-mod-fallback';

  return {
    selectedModPath,
    profile,
    categories,
    candidates,
    recommendedTargets: {
      slotExpansionTargetPath,
      uiThemeSourcePath,
      uiMergeTargetPath,
    },
    notes,
  };
}

async function collectTakenEchoNames(modPath: string): Promise<EchoTakenName[]> {
  const modsPath = store.get('modsPath') as string | undefined;
  if (!modsPath) {
    return [];
  }

  const allMods = ModUtils.readAllMods(modsPath);
  const entries = [...allMods.activeMods, ...allMods.disabledMods];
  const takenNames: EchoTakenName[] = [];

  for (const mod of entries) {
    if (!mod.path || mod.path === modPath) {
      continue;
    }

    takenNames.push({
      name: mod.name,
      modName: mod.name,
      modPath: mod.path,
    });

    try {
      const modInfo = ModUtils.readModInfo(mod.path);
      const displayName = (modInfo?.display_name || '').trim();

      if (displayName) {
        takenNames.push({
          name: displayName,
          modName: mod.name,
          modPath: mod.path,
        });
      }
    } catch (error) {
      // Ignore read failures for individual mods and keep scanning.
    }
  }

  // De-duplicate identical name/mod combinations.
  const dedupeMap = new Map<string, EchoTakenName>();
  for (const entry of takenNames) {
    const key = `${normalizeEchoName(entry.name)}::${entry.modPath}`;
    if (!dedupeMap.has(key)) {
      dedupeMap.set(key, entry);
    }
  }

  return Array.from(dedupeMap.values());
}

function buildEchoNameSuggestions(
  baseWords: string[],
  takenNames: EchoTakenName[],
): string[] {
  const takenSet = new Set(takenNames.map((entry) => toEchoToken(entry.name)));
  const suggestionSet = new Set<string>();
  const suggestions: string[] = [];

  const addSuggestion = (candidate: string) => {
    const trimmed = toEchoToken(candidate);
    if (!trimmed) return;
    if (trimmed.length < 3) return;

    if (suggestionSet.has(trimmed)) return;

    suggestionSet.add(trimmed);
    suggestions.push(trimmed);
  };

  for (const baseWord of baseWords) {
    addSuggestion(baseWord);
  }

  for (const baseWord of baseWords) {
    addSuggestion(`${baseWord}alt`);
    addSuggestion(`${baseWord}x`);
    addSuggestion(`neo${baseWord}`);
  }

  // Push non-conflicting names first to make first-time choices easier.
  suggestions.sort((a, b) => {
    const aTaken = takenSet.has(toEchoToken(a));
    const bTaken = takenSet.has(toEchoToken(b));

    if (aTaken === bTaken) {
      return a.length - b.length;
    }
    return aTaken ? 1 : -1;
  });

  return suggestions;
}

function classifyEchoModEligibility(modPath: string): EchoModEligibility {
  const folderName = path.basename(modPath || '').toLowerCase();
  const info = ModUtils.readModInfo(modPath);
  const categoryRaw = (info?.category || '').trim();
  const category = categoryRaw ? categoryRaw.toLowerCase() : null;

  const movesetCategories = new Set(['moveset', 'movesets']);
  const fighterCategories = new Set(['fighter', 'fighters', 'skin', 'skins']);
  const nonFighterCategories = new Set([
    'stage',
    'stages',
    'effect',
    'effects',
    'ui',
    'param',
    'final smash',
    'other',
    'other/misc',
  ]);

  if (category && movesetCategories.has(category)) {
    return {
      isEligible: false,
      reason: 'moveset-category',
      category,
    };
  }

  if (folderName.includes('moveset')) {
    return {
      isEligible: false,
      reason: 'moveset-name',
      category,
    };
  }

  if (fs.existsSync(path.join(modPath, 'plugin.nro'))) {
    return {
      isEligible: false,
      reason: 'plugin-nro',
      category,
    };
  }

  if (category && nonFighterCategories.has(category)) {
    return {
      isEligible: false,
      reason: 'non-fighter-category',
      category,
    };
  }

  const hasFighterFolder = fs.existsSync(path.join(modPath, 'fighter'));

  if (category && fighterCategories.has(category) && hasFighterFolder) {
    return {
      isEligible: true,
      reason: 'fighter-category',
      category,
    };
  }

  if (hasFighterFolder) {
    return {
      isEligible: true,
      reason: 'fighter-folder',
      category,
    };
  }

  return {
    isEligible: false,
    reason: 'no-fighter-folder',
    category,
  };
}

function isMovesetMod(modPath: string): boolean {
  const folderName = path.basename(modPath || '').toLowerCase();
  const info = ModUtils.readModInfo(modPath);
  const category = (info?.category || '').toLowerCase().trim();

  if (category === 'moveset' || category === 'movesets') {
    return true;
  }

  if (folderName.includes('moveset')) {
    return true;
  }

  return fs.existsSync(path.join(modPath, 'plugin.nro'));
}

function enforceMovesetInName(name: string): string {
  const trimmed = (name || '').trim();

  if (!trimmed) {
    return 'Moveset';
  }

  if (/moveset/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed} Moveset`;
}

const ModHandlers = {
  ['read-mods-folder']: async (
    common: BaseHandlerArg,
    modsPath: string,
  ): HandlerResponse<{
    activeMods: Mod[];
    disabledMods: Mod[];
  }> => {
    try {
      return {
        success: true,
        ...ModUtils.readAllMods(modsPath),
      };
    } catch (error) {
      handleError(error, 'read-mods-folder');
      return {
        success: false,
        error: error.message,
      };
    }
  },

  ['get-preview-image']: async (common: BaseHandlerArg, modPath: string) => {
    try {
      const previewPath = ModUtils.getPreviewImagePath(modPath);
      if (previewPath) {
        return ModUtils.pathToFileUrl(previewPath);
      }
      return null;
    } catch (error) {
      handleError(error, 'get-preview-image');
      return null;
    }
  },

  ['get-mod-info']: async (common: BaseHandlerArg, modPath: string) => {
    try {
      return ModUtils.readModInfo(modPath);
    } catch (error) {
      handleError(error, 'get-mod-info');
      return null;
    }
  },

  ['echo-get-preview-image']: async (
    common: BaseHandlerArg,
    modPath: string,
  ) => {
    try {
      const previewPath = ModUtils.getPreviewImagePath(modPath);
      if (previewPath) {
        return ModUtils.pathToFileUrl(previewPath);
      }

      return null;
    } catch (error) {
      handleError(error, 'echo-get-preview-image');
      return null;
    }
  },

  ['echo-get-mod-info']: async (common: BaseHandlerArg, modPath: string) => {
    try {
      return ModUtils.readModInfo(modPath);
    } catch (error) {
      handleError(error, 'echo-get-mod-info');
      return null;
    }
  },

  ['echo-classify-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
  ): HandlerResponse<EchoModEligibility> => {
    try {
      const result = classifyEchoModEligibility(modPath);
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      handleError(error, 'echo-classify-mod');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['save-mod-info']: async (
    common: BaseHandlerArg,
    modPath: string,
    infoData,
  ): HandlerResponse => {
    try {
      const infoPath = path.join(modPath, 'info.toml');
      let tomlContent = '';

      if (infoData.display_name)
        tomlContent += `display_name = "${infoData.display_name}"\n`;
      if (infoData.authors) tomlContent += `authors = "${infoData.authors}"\n`;
      if (infoData.version) tomlContent += `version = "${infoData.version}"\n`;
      if (infoData.category)
        tomlContent += `category = "${infoData.category}"\n`;
      if (infoData.url) tomlContent += `url = "${infoData.url}"\n`;
      if (infoData.description)
        tomlContent += `description = """\n${infoData.description}\n"""\n`;

      fs.writeFileSync(infoPath, tomlContent, 'utf8');
      return { success: true };
    } catch (error) {
      handleError(error, 'save-mod-info');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['read-mod-info-raw']: async (common: BaseHandlerArg, modPath: string) => {
    try {
      const infoPath = path.join(modPath, 'info.toml');
      if (!fs.existsSync(infoPath)) return '';
      const content = fs.readFileSync(infoPath, 'utf8');
      return content;
    } catch (error) {
      handleError(error, 'read-mod-info-raw');
      return '';
    }
  },

  ['save-mod-info-raw']: async (
    common: BaseHandlerArg,
    modPath,
    tomlContent,
  ): HandlerResponse => {
    try {
      const infoPath = path.join(modPath, 'info.toml');
      fs.writeFileSync(infoPath, tomlContent, 'utf8');
      return { success: true };
    } catch (error) {
      handleError(error, 'save-mod-info-raw');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['createFpp']: async (
    _common: BaseHandlerArg,
    name: string,
    fppVersion: string,
    thumbnailPath: string | null,
    modPaths: string[],
  ): HandlerResponse<{ filePath?: string }> => {
    try {
      if (!name || !modPaths || !Array.isArray(modPaths) || modPaths.length === 0) {
        return createErrorResponse(
          ErrorCodes.UNKNOWN_ERROR,
          'Name and modPaths array are required',
        );
      }

      const mainWindow = BrowserWindow.fromWebContents(_common.event.sender);
      if (!mainWindow) {
        return createErrorResponse(
          ErrorCodes.UNKNOWN_ERROR,
          'No main window found',
        );
      }

      const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

      const saveResult = await dialog.showSaveDialog(mainWindow, {
        title: 'Save FPP File',
        defaultPath: `${safeName}.fpp`,
        filters: [{ name: 'FightPlanner Pack', extensions: ['fpp'] }],
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, canceled: true };
      }

      console.log(`Creating FPP pack: ${name} (v${fppVersion}) with ${modPaths.length} mods`);

      const outputPath = saveResult.filePath;
      const result = await FppHandler.createFpp(name, fppVersion, thumbnailPath, modPaths, outputPath, mainWindow);

      return {
        success: result.success,
        filePath: result.filePath,
      };
    } catch (error) {
      handleError(error, 'create-fpp');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['rename-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
    newName: string,
  ): HandlerResponse<{
    newPath: string;
  }> => {
    try {
      const requestedName = (newName || '').trim();

      if (!requestedName) {
        return createErrorResponse(
          ErrorCodes.MOD_RENAME_ERROR,
          'Mod name cannot be empty',
        );
      }

      const finalName = isMovesetMod(modPath)
        ? enforceMovesetInName(requestedName)
        : requestedName;

      const parentDir = path.dirname(modPath);
      const newPath = path.join(parentDir, finalName);

      if (fs.existsSync(newPath)) {
        return createErrorResponse(
          ErrorCodes.MOD_RENAME_ERROR,
          'A mod with this name already exists',
        );
      }

      fs.renameSync(modPath, newPath);
      return { success: true, newPath };
    } catch (error) {
      handleError(error, 'rename-mod');
      return createErrorResponse(ErrorCodes.MOD_RENAME_ERROR, error.message);
    }
  },

  ['delete-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
  ): HandlerResponse => {
    try {
      if (!fs.existsSync(modPath)) {
        return createErrorResponse(
          ErrorCodes.MOD_NOT_FOUND,
          'Mod folder does not exist',
        );
      }
      fs.rmSync(modPath, { recursive: true, force: true });
      return { success: true };
    } catch (error) {
      handleError(error, 'delete-mod');
      return createErrorResponse(ErrorCodes.MOD_DELETE_ERROR, error.message);
    }
  },

  ['toggle-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
    modsBasePath: string,
  ): HandlerResponse<{
    newPath: string;
    isNowActive: boolean;
  }> => {
    try {
      const modName = path.basename(modPath);
      const parentDir = path.dirname(modsBasePath);
      const disabledModsPath = path.join(parentDir, '{disabled_mod}');
      const isInActiveMods =
        modPath.includes(modsBasePath) && !modPath.includes('{disabled_mods}');

      let targetPath;
      if (isInActiveMods) {
        if (!fs.existsSync(disabledModsPath)) {
          fs.mkdirSync(disabledModsPath, { recursive: true });
        }
        targetPath = path.join(disabledModsPath, modName);
      } else {
        targetPath = path.join(modsBasePath, modName);
      }

      if (fs.existsSync(targetPath)) {
        return createErrorResponse(
          ErrorCodes.MOD_RENAME_ERROR,
          'A mod with this name already exists in the target location',
        );
      }

      fs.renameSync(modPath, targetPath);

      return {
        success: true,
        newPath: targetPath,
        isNowActive: !isInActiveMods,
      };
    } catch (error) {
      handleError(error, 'toggle-mod');
      return createErrorResponse(ErrorCodes.MOD_RENAME_ERROR, error.message);
    }
  },

  ['scan-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
  ): HandlerResponse<{
    data: ScanModResult;
  }> => {
    try {
      const data = await ModScanner.scanModFiles(modPath);
      return { success: true, data };
    } catch (error) {
      handleError(error, 'scan-mod-slots');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['change-slots']: async (
    common: BaseHandlerArg,
    modPath: string,
    pathData: PathData,
    slotAssignments: Map<string, Map<string, string>>,
    deletedSlots: Map<string, Set<string>>,
    slotCustomNamesByFighter: SlotCustomNamesByFighter = {},
    options: EchoOperationOptions = {},
  ): HandlerResponse => {
    try {
      await SlotChanger.removeSlots(modPath, deletedSlots, pathData);

      for (const [fighterName, slots] of deletedSlots) {
        for (const slot of slots) {
          const fighterAssignments = slotAssignments.get(fighterName);

          if (fighterAssignments) {
            fighterAssignments.delete(slot);
          }
        }
      }

      await SlotChanger.changeSlots(
        modPath,
        slotAssignments,
        pathData,
        slotCustomNamesByFighter,
        options,
      );

      return { success: true };
    } catch (error) {
      handleError(error, 'change-slots');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['echo-get-slot-analysis']: async (
    common: BaseHandlerArg,
    modPath: string,
  ): HandlerResponse<{
    fighters: {
      fighterName: string;
      slots: string[];
      highestSlot: number;
      numColorSlots: number;
      suggestedName: string;
    }[];
    isEchoFighter: boolean;
    defaultEchoName: string;
    nameSuggestions: string[];
    takenNames: EchoTakenName[];
  }> => {
    try {
      const scanResult = await ModScanner.scanModFiles(modPath);
      const modInfo = ModUtils.readModInfo(modPath);
      const takenNames = await collectTakenEchoNames(modPath);

      const displayName = (modInfo?.display_name || '').trim();
      const folderName = path.basename(modPath).trim();

      const excludedNameTokens = new Set<string>();
      scanResult.fighterNames.forEach((fighterName) => {
        const token = toEchoToken(fighterName);
        if (token) excludedNameTokens.add(token);
      });

      const fighterEntries = await Promise.all(
        Object.keys(scanResult.pathData).map(async (fighterName) => {
          const defaultNames = await SlotChanger.getDefaultCustomNames(fighterName);
          const suggestedName =
            (defaultNames?.cspName || defaultNames?.vsName || fighterName || '')
              .replace(/\s+/g, ' ')
              .trim();

          const fighterToken = toEchoToken(fighterName);
          if (fighterToken) {
            excludedNameTokens.add(fighterToken);
          }

          splitWords(suggestedName).forEach((word) => {
            const token = toEchoToken(word);
            if (token) excludedNameTokens.add(token);
          });

          const slots = Object.keys(scanResult.pathData[fighterName])
            .filter((slot) => /^c\d{2,3}$/i.test(slot))
            .sort(
              (a, b) =>
                parseInt(a.replace('c', ''), 10) -
                parseInt(b.replace('c', ''), 10),
            );

          const highestSlot = slots.reduce((max, slot) => {
            const slotNumber = parseInt(slot.replace('c', ''), 10);
            return slotNumber > max ? slotNumber : max;
          }, 0);

          return {
            fighterName,
            slots,
            highestSlot,
            numColorSlots: highestSlot + 1,
            suggestedName,
          };
        }),
      );

      const namingSeeds = [
        displayName,
        folderName,
        (modInfo?.s_name || '').trim(),
        (modInfo?.description || '').trim(),
      ].filter((value) => Boolean(value));

      const nameSuggestions = buildEchoNameSuggestions(
        extractThemeWordCandidates(namingSeeds, excludedNameTokens),
        takenNames,
      );

      const takenSet = new Set(takenNames.map((entry) => toEchoToken(entry.name)));
      let defaultEchoName =
        nameSuggestions.find((candidate) => !takenSet.has(candidate)) ||
        nameSuggestions[0] ||
        fallbackEchoNameFromSeeds(namingSeeds, excludedNameTokens);

      if (takenSet.has(defaultEchoName)) {
        const fallbackCandidates = ['echoform', 'variant', 'customalt'];
        const availableFallback = fallbackCandidates.find(
          (candidate) => !takenSet.has(toEchoToken(candidate)),
        );

        defaultEchoName = toEchoToken(availableFallback || 'echoform');
      }

      const fighters = fighterEntries;

      return {
        success: true,
        fighters,
        isEchoFighter: detectEchoFromScanResult(scanResult),
        defaultEchoName,
        nameSuggestions,
        takenNames,
      };
    } catch (error) {
      handleError(error, 'echo-get-slot-analysis');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['echo-plan-ui-compatibility']: async (
    common: BaseHandlerArg,
    selectedModPath: string,
  ): HandlerResponse<EchoUiCompatibilityPlan> => {
    try {
      if (!selectedModPath || !fs.existsSync(selectedModPath)) {
        return createErrorResponse(
          ErrorCodes.MOD_READ_ERROR,
          'Selected mod path is invalid.',
        );
      }

      const modsPath = store.get('modsPath') as string | undefined;
      const selectedModName = path.basename(selectedModPath);

      const allMods = modsPath
        ? ModUtils.readAllMods(modsPath)
        : { activeMods: [], disabledMods: [] };

      const allCandidates = [
        ...allMods.activeMods,
        ...allMods.disabledMods,
      ] as Mod[];

      const plan = resolveUiCompatibilityPlan(
        selectedModPath,
        selectedModName,
        allCandidates,
      );

      return {
        success: true,
        ...plan,
      };
    } catch (error) {
      handleError(error, 'echo-plan-ui-compatibility');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['ui-builder-analyze-mods']: async (
    common: BaseHandlerArg,
  ): HandlerResponse<UiBuilderAnalyzeResponse> => {
    try {
      const modsPath = store.get('modsPath') as string | undefined;

      if (!modsPath || !fs.existsSync(modsPath)) {
        return createErrorResponse(
          ErrorCodes.FILE_NOT_FOUND,
          'Mods path is not configured.',
        );
      }

      const allMods = ModUtils.readAllMods(modsPath);
      const mergedMods = [...allMods.activeMods, ...allMods.disabledMods];

      const analyzedMods = mergedMods
        .map((mod) => buildUiBuilderModAnalysis(mod))
        .filter((mod) => mod.uiFiles.length > 0)
        .sort((a, b) => {
          if (a.status === b.status) {
            return a.name.localeCompare(b.name);
          }

          if (a.status === 'active') return -1;
          if (b.status === 'active') return 1;
          return a.name.localeCompare(b.name);
        });

      return {
        success: true,
        modsPath,
        mods: analyzedMods,
      };
    } catch (error) {
      handleError(error, 'ui-builder-analyze-mods');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['ui-builder-build-bundle']: async (
    common: BaseHandlerArg,
    request: UiBuilderBuildRequest,
  ): HandlerResponse<UiBuilderBuildResponse> => {
    try {
      const modsPath = store.get('modsPath') as string | undefined;

      if (!modsPath || !fs.existsSync(modsPath)) {
        return createErrorResponse(
          ErrorCodes.FILE_NOT_FOUND,
          'Mods path is not configured.',
        );
      }

      const safeOutputFolderName = `${request?.outputFolderName || '[UI] Smash UI Builder Output'}`
        .replace(/[<>:"|?*]/g, '')
        .trim();

      if (!safeOutputFolderName) {
        return createErrorResponse(
          ErrorCodes.INVALID_PATH,
          'Output folder name is invalid.',
        );
      }

      const outputPath = path.join(modsPath, safeOutputFolderName);
      const normalizedModsRoot = path.resolve(modsPath).toLowerCase();
      const normalizedOutputPath = path.resolve(outputPath).toLowerCase();

      if (!normalizedOutputPath.startsWith(normalizedModsRoot)) {
        return createErrorResponse(
          ErrorCodes.INVALID_PATH,
          'Output path must stay inside mods folder.',
        );
      }

      const allMods = ModUtils.readAllMods(modsPath);
      const mergedMods = [...allMods.activeMods, ...allMods.disabledMods];
      const analysisByPath = new Map(
        mergedMods.map((mod) => {
          const analyzed = buildUiBuilderModAnalysis(mod);
          return [mod.path, analyzed] as const;
        }),
      );

      const categorySelections = request?.categorySelections || {};
      const selectedCategories = UI_BUILDER_CATEGORIES.filter(
        (category) => Boolean(categorySelections[category]),
      );

      if (selectedCategories.length === 0) {
        return createErrorResponse(
          ErrorCodes.INVALID_PATH,
          'Select at least one category to build.',
        );
      }

      await fs.promises.rm(outputPath, { recursive: true, force: true });
      await fs.promises.mkdir(outputPath, { recursive: true });

      const copiedFiles: string[] = [];
      const copiedByRelativePath = new Map<string, string>();
      const skippedConflicts: UiBuilderSkippedConflict[] = [];

      for (const category of selectedCategories) {
        const modPath = categorySelections[category];
        if (!modPath) continue;

        const analyzed = analysisByPath.get(modPath);
        if (!analyzed) continue;

        const filesForCategory = analyzed.categoryMatches[category] || [];

        for (const relativePath of filesForCategory) {
          const sourcePath = path.join(modPath, relativePath);
          if (!fs.existsSync(sourcePath)) continue;

          const existingSource = copiedByRelativePath.get(relativePath);
          if (existingSource && existingSource !== modPath) {
            skippedConflicts.push({
              relativePath,
              existingModPath: existingSource,
              skippedModPath: modPath,
              category,
            });
            continue;
          }

          if (existingSource === modPath) {
            continue;
          }

          const targetPath = path.join(outputPath, relativePath);
          await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.promises.copyFile(sourcePath, targetPath);
          copiedByRelativePath.set(relativePath, modPath);
          copiedFiles.push(relativePath);
        }
      }

      const infoToml = [
        `display_name = "${safeOutputFolderName}"`,
        `version = "1.0.0"`,
        `authors = "FightPlanner"`,
        `description = "Generated by Smash UI Builder. Combines selected UI categories into one conflict-safe output mod."`,
      ].join('\n');

      await fs.promises.writeFile(path.join(outputPath, 'info.toml'), infoToml, 'utf8');

      return {
        success: true,
        outputPath,
        copiedFiles,
        skippedConflicts,
        selectedCategories,
      };
    } catch (error) {
      handleError(error, 'ui-builder-build-bundle');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['echo-resolve-character-image']: async (
    common: BaseHandlerArg,
    fighterKey: string,
    remoteUrl: string,
  ) => {
    try {
      return await resolveCharacterImageUrl(fighterKey, remoteUrl);
    } catch (error) {
      handleError(error, 'echo-resolve-character-image');
      return null;
    }
  },

  ['echo-load-ui-layout-state']: async (
    common: BaseHandlerArg,
    slotTargetModPath: string,
  ) => {
    try {
      return await loadEchoLayoutState(slotTargetModPath);
    } catch (error) {
      handleError(error, 'echo-load-ui-layout-state');
      return null;
    }
  },

  ['echo-save-ui-layout-state']: async (
    common: BaseHandlerArg,
    slotTargetModPath: string,
    payload: EchoLayoutStatePayload,
  ) => {
    try {
      return await saveEchoLayoutState(slotTargetModPath, payload);
    } catch (error) {
      handleError(error, 'echo-save-ui-layout-state');
      return false;
    }
  },

  ['echo-read-ui-chara-struct']: async (
    common: BaseHandlerArg,
    slotTargetModPath: string,
    fighterName: string,
  ) => {
    try {
      return await readUiCharaStructInspector(slotTargetModPath, fighterName);
    } catch (error) {
      handleError(error, 'echo-read-ui-chara-struct');
      return null;
    }
  },

  ['echo-rename-c-folders']: async (
    common: BaseHandlerArg,
    modPath: string,
    pathData: PathData,
    slotAssignments: Map<string, Map<string, string>>,
  ): HandlerResponse => {
    try {
      await SlotChanger.changeSlots(modPath, slotAssignments, pathData, {}, {
        renameFolders: true,
        renameFiles: false,
        applyMetadata: false,
        generateConfig: false,
      });

      return { success: true };
    } catch (error) {
      handleError(error, 'echo-rename-c-folders');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['echo-rename-chara-files']: async (
    common: BaseHandlerArg,
    modPath: string,
    pathData: PathData,
    slotAssignments: Map<string, Map<string, string>>,
  ): HandlerResponse => {
    try {
      await SlotChanger.changeSlots(modPath, slotAssignments, pathData, {}, {
        renameFolders: false,
        renameFiles: true,
        applyMetadata: false,
        generateConfig: false,
      });

      return { success: true };
    } catch (error) {
      handleError(error, 'echo-rename-chara-files');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['echo-generate-config']: async (
    common: BaseHandlerArg,
    modPath: string,
    pathData: PathData,
    slotAssignments: Map<string, Map<string, string>>,
  ): HandlerResponse => {
    try {
      await SlotChanger.changeSlots(modPath, slotAssignments, pathData, {}, {
        renameFolders: false,
        renameFiles: false,
        applyMetadata: false,
        generateConfig: true,
      });

      return { success: true };
    } catch (error) {
      handleError(error, 'echo-generate-config');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['detect-conflicts']: async (
    common: BaseHandlerArg,
    modsPath: string,
    whitelistPatterns: string[] = [],
  ): HandlerResponse<{
    conflictGroups: {
      fighter: string;
      slot: string;
      conflicts: {
        filePath: string;
        mods: {
          name: string;
          path: string;
        }[];
      }[];
    }[];
    totalConflicts: number;
    activeModsCount: number;
  }> => {
    try {
      const result = ModUtils.readAllMods(modsPath);

      const conflictGroups = await ModUtils.detectConflicts(
        result.activeMods,
        whitelistPatterns,
      );

      // Calculate total conflicts across all groups
      const totalConflicts = conflictGroups.reduce(
        (sum, group) => sum + group.conflicts.length,
        0,
      );

      return {
        success: true,
        conflictGroups,
        totalConflicts,
        activeModsCount: result.activeMods.length,
      };
    } catch (error) {
      handleError(error, 'detect-conflicts');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['install-mod-from-path']: async (
    common: BaseHandlerArg,
    sourcePath: string,
    modsPath: string,
  ) => {
    try {
      return await ModUtils.installModFromPath(sourcePath, modsPath);
    } catch (error) {
      handleError(error, 'install-mod-from-path');
      return createErrorResponse(ErrorCodes.MOD_INSTALL_ERROR, error.message);
    }
  },

  ['handle-files-dropped']: async (common: BaseHandlerArg, filePaths) => {
    try {
      const modsPath = store.get('modsPath') as string | null;
      if (!modsPath) {
        return createErrorResponse(
          ErrorCodes.FOLDER_NOT_FOUND,
          'Mods folder not configured. Please set it in Settings.',
        );
      }

      const results: {
        filePath: string;
        result: any;
      }[] = [];

      for (const filePath of filePaths) {
        try {
          const installResult = await ModUtils.installModFromPath(
            filePath,
            modsPath,
          );

          results.push({ filePath, result: installResult });
        } catch (error) {
          results.push({
            filePath,
            result: { success: false, error: error.message },
          });
        }
      }
      return { success: true, results };
    } catch (error) {
      handleError(error, 'handle-files-dropped');
      return createErrorResponse(ErrorCodes.MOD_INSTALL_ERROR, error.message);
    }
  },
} as const;

/**
 * Register all IPC handlers related to mod operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerModHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(ModHandlers) as Array<
    keyof typeof ModHandlers
  >) {
    const handler = ModHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
