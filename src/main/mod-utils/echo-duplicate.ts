import path from 'path';

import { ModFileOperations } from '../mod-file-operations';
import { PATHS } from '../config';
import type { SlotCustomData } from './slot-changer';

type SlotCustomNames = Record<string, SlotCustomData>;

export interface EchoDuplicateInput {
  modPath: string;
  fighterName: string;
  finalSlots: string[];
  fighterCustomNames: SlotCustomNames;
  defaultCustomNames: SlotCustomData;
  echoNameId?: string;
  nIndexOffset?: number;
}

type EchoIdentity = {
  nameId: string;
  displayName: string;
  vsName: string;
  boxingRingName: string;
  announcerLabel: string;
};

type EchoSlotInfo = {
  uniqueSlots: string[];
  colorStartIndex: number;
  colorNum: number;
};

export class EchoDuplicateService {
  static async applyCharacterDuplicateMetadata({
    modPath,
    fighterName,
    finalSlots,
    fighterCustomNames,
    defaultCustomNames,
    echoNameId,
  }: EchoDuplicateInput): Promise<void> {
    if (!fighterName || !finalSlots.length) {
      return;
    }

    const identity = this.resolveIdentity(
      echoNameId,
      fighterCustomNames,
      defaultCustomNames,
      fighterName,
    );

    const slotInfo = this.resolveSlotInfo(
      finalSlots,
    );

    if (slotInfo.uniqueSlots.length === 0) {
      return;
    }

    const fighterIndex = await this.resolveFighterIndex(fighterName);

    await this.writeUiCharaDb({
      modPath,
      fighterName,
      fighterIndex,
      identity,
      slotInfo,
    });

    await this.writeMsgName({
      modPath,
      identity,
    });
  }

  private static sanitizeNameId(value: string): string {
    return (value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
  }

  private static resolveIdentity(
    echoNameId: string | undefined,
    fighterCustomNames: SlotCustomNames,
    defaultCustomNames: SlotCustomData,
    fighterName: string,
  ): EchoIdentity {
    const preferredNameId = this.sanitizeNameId(echoNameId || fighterName);
    const firstCustom = Object.values(fighterCustomNames).find((entry) => {
      return Boolean(entry?.cspName || entry?.vsName || entry?.boxingRing);
    });

    const fallbackDisplayName = preferredNameId
      ? preferredNameId.charAt(0).toUpperCase() + preferredNameId.slice(1)
      : fighterName;

    const displayName =
      firstCustom?.cspName ||
      defaultCustomNames.cspName ||
      defaultCustomNames.vsName ||
      fallbackDisplayName;

    return {
      nameId: preferredNameId,
      displayName,
      vsName: firstCustom?.vsName || defaultCustomNames.vsName || displayName.toUpperCase(),
      boxingRingName:
        firstCustom?.boxingRing || defaultCustomNames.boxingRing || displayName,
      announcerLabel: `vc_narration_characall_${preferredNameId}`,
    };
  }

  private static resolveSlotInfo(
    finalSlots: string[],
  ): EchoSlotInfo {
    const uniqueSlots = Array.from(new Set(finalSlots));
    const validSlotNumbers: number[] = [];

    for (const slot of uniqueSlots) {
      if (!/^c\d{2,3}$/i.test(slot)) {
        continue;
      }

      validSlotNumbers.push(parseInt(slot.replace('c', ''), 10));
    }

    if (validSlotNumbers.length === 0) {
      return {
        uniqueSlots: [],
        colorStartIndex: 0,
        colorNum: 0,
      };
    }

    const colorStartIndex = Math.min(...validSlotNumbers);

    return {
      uniqueSlots,
      colorStartIndex,
      // User rule: amount of colors equals number of color slots in the mod.
      colorNum: validSlotNumbers.length,
    };
  }

  private static async resolveFighterIndex(fighterName: string): Promise<number> {
    const namesDataPath = path.join(PATHS.dataDir(), 'names.data');
    const namesData = await ModFileOperations.readModFile(namesDataPath);

    for (const line of namesData.split(/\r?\n/)) {
      const parts = line.split(',').map((value) => value.trim());

      if (parts.length < 3) {
        continue;
      }

      if (parts[0].toLowerCase() === fighterName.trim().toLowerCase()) {
        const index = parseInt(parts[2], 10);
        if (!Number.isNaN(index)) {
          return index;
        }
      }
    }

    throw new Error(`Fighter name "${fighterName}" not found in names.data`);
  }

  private static async writeUiCharaDb({
    modPath,
    fighterName,
    fighterIndex,
    identity,
    slotInfo,
  }: {
    modPath: string;
    fighterName: string;
    fighterIndex: number;
    identity: EchoIdentity;
    slotInfo: EchoSlotInfo;
  }) {
    const outputDir = path.join(modPath, 'ui', 'param', 'database');
    const outputPath = path.join(outputDir, 'ui_chara_db.prcxml');
    const templatePath = path.join(PATHS.dataDir(), 'ui_chara_db.prcxml');

    const xmlSourcePath =
      (await ModFileOperations.fileExists(outputPath)) ? outputPath : templatePath;
    let xmlContent = await ModFileOperations.readModFile(xmlSourcePath);

    const params: string[] = [];

    params.push(`<hash40 hash="ui_chara_id">ui_chara_${identity.nameId}</hash40>`);
    params.push(`<string hash="name_id">${this.escapeXml(identity.nameId)}</string>`);
    params.push(`<hash40 hash="fighter_kind">fighter_kind_${fighterName}</hash40>`);
    params.push(
      `<hash40 hash="fighter_kind_corps">fighter_kind_${fighterName}</hash40>`,
    );
    params.push('<hash40 hash="alt_chara_id"></hash40>');
    params.push(`<byte hash="color_start_index">${slotInfo.colorStartIndex}</byte>`);
    params.push(`<byte hash="color_num">${slotInfo.colorNum}</byte>`);

    // User rule: cXX/nXX should stay 0 for the base 8 slots.
    for (let i = 0; i < 8; i += 1) {
      const index = String(i).padStart(2, '0');
      params.push(`<byte hash="c${index}_index">0</byte>`);
      params.push(`<byte hash="n${index}_index">0</byte>`);
    }

    // User rule: set announcer only for c00.
    params.push(
      `<hash40 hash="characall_label_c00">${this.escapeXml(identity.announcerLabel)}</hash40>`,
    );

    const structXml = `<struct index="${fighterIndex}">${params.join('')}</struct>`;
    const structRegex = new RegExp(
      `<struct\\s+index="${fighterIndex}"[\\s\\S]*?<\\/struct>`,
    );
    const dummyRegex = new RegExp(
      `<hash40\\s+index="${fighterIndex}">dummy<\\/hash40>`,
    );

    if (structRegex.test(xmlContent)) {
      xmlContent = xmlContent.replace(structRegex, structXml);
    } else if (dummyRegex.test(xmlContent)) {
      xmlContent = xmlContent.replace(dummyRegex, structXml);
    } else if (xmlContent.includes('</list>')) {
      xmlContent = xmlContent.replace('</list>', `${structXml}</list>`);
    } else {
      xmlContent += `\n${structXml}\n`;
    }

    if (!(await ModFileOperations.fileExists(outputDir))) {
      await ModFileOperations.createDirectory(outputDir);
    }

    await ModFileOperations.writeModFile(outputPath, xmlContent);
  }

  private static async writeMsgName({
    modPath,
    identity,
  }: {
    modPath: string;
    identity: EchoIdentity;
  }) {
    const outputDir = path.join(modPath, 'ui', 'message');
    const outputPath = path.join(outputDir, 'msg_name.xmsbt');

    const entriesByLabel = new Map<string, string>();

    if (await ModFileOperations.fileExists(outputPath)) {
      const existingXml = await ModFileOperations.readModFile(outputPath);
      const existingEntryRegex =
        /<entry\s+label="([^"]+)">[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<\/entry>/g;

      let existingMatch: RegExpExecArray | null;
      while ((existingMatch = existingEntryRegex.exec(existingXml)) !== null) {
        entriesByLabel.set(existingMatch[1], existingMatch[2]);
      }
    }

    const setEntry = (label: string, value: string) => {
      entriesByLabel.set(label, this.escapeXml(value));
    };

    // Base naming labels use index 08 and the new name_id suffix.
    const label = '08';
    setEntry(`nam_chr0_${label}_${identity.nameId}`, identity.displayName);
    setEntry(`nam_chr1_${label}_${identity.nameId}`, identity.displayName);
    setEntry(`nam_chr2_${label}_${identity.nameId}`, identity.vsName);
    setEntry(`nam_stage_name_${label}_${identity.nameId}`, identity.boxingRingName);

    if (entriesByLabel.size === 0) {
      return;
    }

    const xmlEntries: string[] = [];
    for (const [label, value] of entriesByLabel.entries()) {
      xmlEntries.push(`\t<entry label="${label}">`);
      xmlEntries.push(`\t\t<text>${value}</text>`);
      xmlEntries.push('\t</entry>');
    }

    const xmlContent = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<xmsbt>',
      ...xmlEntries,
      '</xmsbt>',
    ].join('\n');

    if (!(await ModFileOperations.fileExists(outputDir))) {
      await ModFileOperations.createDirectory(outputDir);
    }

    await ModFileOperations.writeModFile(outputPath, xmlContent);
  }

  private static escapeXml(str: string): string {
    if (!str) return '';

    return str
      .replace(/\\n/g, '\n')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}