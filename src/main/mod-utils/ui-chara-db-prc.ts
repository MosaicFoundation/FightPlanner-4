import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { promises as fsp } from 'node:fs';
import { app } from 'electron';

import { PATHS } from '../config';
import { ModFileOperations } from '../mod-file-operations';

type PrcHashEntry = {
  '@hash': string;
  '#text': string;
};

type PrcStructNode = {
  '@index'?: string;
  hash40?: PrcHashEntry[] | PrcHashEntry;
  string?: PrcHashEntry[] | PrcHashEntry;
  byte?: PrcHashEntry[] | PrcHashEntry;
  [key: string]: unknown;
};

type ToolPaths = {
  dllPath: string;
  labelsPath: string;
};

export type UiCharaDbBinaryPatch = {
  fighterIndex: number;
  hash40?: Record<string, string>;
  string?: Record<string, string>;
  byte?: Record<string, number>;
};

export class UiCharaDbBinaryService {
  private static cachedToolPaths: ToolPaths | null | undefined;

  static async applyPatches(
    modPath: string,
    patches: UiCharaDbBinaryPatch[],
  ): Promise<boolean> {
    if (!modPath || !patches.length) {
      return false;
    }

    const toolPaths = await this.resolveToolPaths();
    if (!toolPaths) {
      console.warn(
        '[ui_chara_db.prc] prc2json tool was not found; skipping binary PRC overwrite.',
      );
      return false;
    }

    const prcPath = path.join(modPath, 'ui', 'param', 'database', 'ui_chara_db.prc');
    await this.ensureBasePrcFile(prcPath);

    if (!(await ModFileOperations.fileExists(prcPath))) {
      console.warn(
        '[ui_chara_db.prc] Target PRC does not exist and no fallback base file was found:',
        prcPath,
      );
      return false;
    }

    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'fightplanner-prc-'));
    const jsonPath = path.join(tempDir, 'ui_chara_db.json');
    const patchedPrcPath = path.join(tempDir, 'ui_chara_db.patched.prc');

    try {
      await this.runDotnet([
        toolPaths.dllPath,
        prcPath,
        '-d',
        '-l',
        toolPaths.labelsPath,
        '-o',
        jsonPath,
      ]);

      const rawJson = await fsp.readFile(jsonPath, 'utf8');
      const parsed = JSON.parse(rawJson);
      this.applyPatchesToDocument(parsed, patches);

      await fsp.writeFile(jsonPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

      await this.runDotnet([
        toolPaths.dllPath,
        jsonPath,
        '-a',
        '-l',
        toolPaths.labelsPath,
        '-o',
        patchedPrcPath,
      ]);

      await ModFileOperations.createDirectory(path.dirname(prcPath));
      await fsp.copyFile(patchedPrcPath, prcPath);

      return true;
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  }

  static async readStructFields(
    modPath: string,
    fighterIndex: number,
  ): Promise<{ sourcePath: string; fields: Record<string, string> } | null> {
    if (!modPath || fighterIndex < 0) {
      return null;
    }

    const toolPaths = await this.resolveToolPaths();
    if (!toolPaths) {
      return null;
    }

    const prcPath = path.join(modPath, 'ui', 'param', 'database', 'ui_chara_db.prc');
    if (!(await ModFileOperations.fileExists(prcPath))) {
      return null;
    }

    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'fightplanner-prc-read-'));
    const jsonPath = path.join(tempDir, 'ui_chara_db.read.json');

    try {
      await this.runDotnet([
        toolPaths.dllPath,
        prcPath,
        '-d',
        '-l',
        toolPaths.labelsPath,
        '-o',
        jsonPath,
      ]);

      const rawJson = await fsp.readFile(jsonPath, 'utf8');
      const parsed = JSON.parse(rawJson);
      const structNode = this.findStructByIndex(parsed, fighterIndex);

      if (!structNode) {
        return null;
      }

      const fields = this.collectStructFields(structNode);

      return {
        sourcePath: prcPath,
        fields,
      };
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  }

  private static async ensureBasePrcFile(targetPath: string): Promise<void> {
    if (await ModFileOperations.fileExists(targetPath)) {
      return;
    }

    const fallbackCandidates = this.getFallbackBasePrcPaths();

    for (const candidate of fallbackCandidates) {
      if (!(await ModFileOperations.fileExists(candidate))) {
        continue;
      }

      await ModFileOperations.createDirectory(path.dirname(targetPath));
      await fsp.copyFile(candidate, targetPath);
      return;
    }
  }

  private static getFallbackBasePrcPaths(): string[] {
    const homeDir = this.getHomeDir();

    return [
      path.join(PATHS.dataDir(), 'ui_chara_db.prc'),
      path.join(
        homeDir,
        'Desktop',
        'CSS Manager',
        'css-manager-win32-x64',
        'resources',
        'files',
        'ui',
        'param',
        'database',
        'ui_chara_db.prc',
      ),
      path.join(
        homeDir,
        'Desktop',
        'CSS Manager',
        'css-manager-win32-x64',
        'resources',
        'backup',
        'ui_chara_db.prc',
      ),
    ];
  }

  private static applyPatchesToDocument(
    documentNode: any,
    patches: UiCharaDbBinaryPatch[],
  ): void {
    const listNode = documentNode?.struct?.list;

    if (!listNode) {
      throw new Error('Invalid ui_chara_db JSON payload: missing struct.list root');
    }

    const existingStructs = this.toStructArray(listNode.struct);
    const structByIndex = new Map<string, PrcStructNode>();

    for (const structNode of existingStructs) {
      const indexKey = String(structNode?.['@index'] ?? '');
      if (!indexKey) {
        continue;
      }

      structByIndex.set(indexKey, structNode);
    }

    const mergedPatches = this.mergePatchesByIndex(patches);

    for (const patch of mergedPatches) {
      const indexKey = String(patch.fighterIndex);
      let structNode = structByIndex.get(indexKey);

      if (!structNode) {
        structNode = { '@index': indexKey };
        existingStructs.push(structNode);
        structByIndex.set(indexKey, structNode);
      }

      this.upsertTypedEntries(structNode, 'hash40', patch.hash40);
      this.upsertTypedEntries(structNode, 'string', patch.string);
      this.upsertTypedEntries(structNode, 'byte', patch.byte);
    }

    listNode.struct = existingStructs;
  }

  private static toStructArray(value: unknown): PrcStructNode[] {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value as PrcStructNode[];
    }

    return [value as PrcStructNode];
  }

  private static mergePatchesByIndex(
    patches: UiCharaDbBinaryPatch[],
  ): UiCharaDbBinaryPatch[] {
    const merged = new Map<number, UiCharaDbBinaryPatch>();

    for (const patch of patches) {
      const existing = merged.get(patch.fighterIndex);
      if (!existing) {
        merged.set(patch.fighterIndex, {
          fighterIndex: patch.fighterIndex,
          hash40: { ...(patch.hash40 || {}) },
          string: { ...(patch.string || {}) },
          byte: { ...(patch.byte || {}) },
        });
        continue;
      }

      existing.hash40 = {
        ...(existing.hash40 || {}),
        ...(patch.hash40 || {}),
      };
      existing.string = {
        ...(existing.string || {}),
        ...(patch.string || {}),
      };
      existing.byte = {
        ...(existing.byte || {}),
        ...(patch.byte || {}),
      };
    }

    return Array.from(merged.values());
  }

  private static upsertTypedEntries(
    structNode: PrcStructNode,
    field: 'hash40' | 'string' | 'byte',
    updates?: Record<string, string | number>,
  ): void {
    if (!updates || Object.keys(updates).length === 0) {
      return;
    }

    const entries = this.normalizeEntries(structNode[field]);

    for (const [hashName, value] of Object.entries(updates)) {
      const textValue = typeof value === 'number' ? String(value) : value;

      const existing = entries.find((entry) => entry['@hash'] === hashName);
      if (existing) {
        existing['#text'] = textValue;
      } else {
        entries.push({
          '@hash': hashName,
          '#text': textValue,
        });
      }
    }

    structNode[field] = entries;
  }

  private static normalizeEntries(
    value: PrcHashEntry | PrcHashEntry[] | undefined,
  ): PrcHashEntry[] {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value;
    }

    return [value];
  }

  private static findStructByIndex(
    documentNode: any,
    fighterIndex: number,
  ): PrcStructNode | null {
    const structNodes = this.toStructArray(documentNode?.struct?.list?.struct);
    const fighterIndexKey = String(fighterIndex);

    for (const structNode of structNodes) {
      if (String(structNode?.['@index'] ?? '') === fighterIndexKey) {
        return structNode;
      }
    }

    return null;
  }

  private static collectStructFields(structNode: PrcStructNode): Record<string, string> {
    const fields: Record<string, string> = {};
    const typedFieldKeys: Array<'hash40' | 'string' | 'byte'> = [
      'hash40',
      'string',
      'byte',
    ];
    const additionalTypedFields = ['short', 'int', 'sbyte', 'bool'];

    for (const typedFieldKey of typedFieldKeys) {
      const entries = this.normalizeEntries(structNode[typedFieldKey]);
      for (const entry of entries) {
        if (!entry?.['@hash']) {
          continue;
        }

        fields[entry['@hash']] = String(entry['#text'] ?? '');
      }
    }

    for (const typedFieldName of additionalTypedFields) {
      const rawValue = structNode[typedFieldName] as
        | PrcHashEntry
        | PrcHashEntry[]
        | undefined;

      const entries = this.normalizeEntries(rawValue);
      for (const entry of entries) {
        if (!entry?.['@hash']) {
          continue;
        }

        fields[entry['@hash']] = String(entry['#text'] ?? '');
      }
    }

    return fields;
  }

  private static async resolveToolPaths(): Promise<ToolPaths | null> {
    if (this.cachedToolPaths !== undefined) {
      return this.cachedToolPaths;
    }

    const envDll = process.env.FIGHTPLANNER_PRC2JSON_DLL;
    const envLabels = process.env.FIGHTPLANNER_PRC2JSON_LABELS;
    if (envDll && envLabels) {
      if (
        (await ModFileOperations.fileExists(envDll)) &&
        (await ModFileOperations.fileExists(envLabels))
      ) {
        this.cachedToolPaths = {
          dllPath: envDll,
          labelsPath: envLabels,
        };
        return this.cachedToolPaths;
      }
    }

    const homeDir = this.getHomeDir();

    const toolDirs = [
      path.join(process.resourcesPath || '', 'tools', 'prc2json'),
      path.join(app.getAppPath(), 'tools', 'prc2json'),
      path.join(homeDir, 'Desktop', 'CSS Manager', 'css-manager-win32-x64', 'resources', 'tools', 'prc2json'),
    ];

    for (const toolDir of toolDirs) {
      const dllPath = path.join(toolDir, 'prc2json.dll');
      const labelsPath = path.join(toolDir, 'ParamLabels_A.csv');

      if (
        (await ModFileOperations.fileExists(dllPath)) &&
        (await ModFileOperations.fileExists(labelsPath))
      ) {
        this.cachedToolPaths = {
          dllPath,
          labelsPath,
        };
        return this.cachedToolPaths;
      }
    }

    this.cachedToolPaths = null;
    return null;
  }

  private static getHomeDir(): string {
    try {
      return app.getPath('home');
    } catch (_error) {
      return process.env.USERPROFILE || process.env.HOME || '';
    }
  }

  private static runDotnet(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('dotnet', args, {
        windowsHide: true,
      });

      const maxOutputLength = 24000;
      let output = '';

      const appendOutput = (chunk: Buffer) => {
        if (output.length >= maxOutputLength) {
          return;
        }

        output += chunk.toString('utf8');
      };

      child.stdout.on('data', appendOutput);
      child.stderr.on('data', appendOutput);
      child.on('error', (error) => reject(error));

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            `dotnet prc2json failed with exit code ${code}. Output: ${output.trim()}`,
          ),
        );
      });
    });
  }
}
