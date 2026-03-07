import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import * as fse from 'fs-extra';

import { PathData } from './mod-scanner';
import { ModFileOperations } from '../mod-file-operations';
import { ConfigGenerator } from './config-generator';
import { EchoDuplicateService } from './echo-duplicate';
import { PATHS } from '../config';

interface CustomData {
  cspName?: string;
  vsName?: string;
  boxingRing?: string;
  announcer?: string;
}

export type SlotCustomData = CustomData;

export type SlotCustomNamesByFighter = Record<
  string,
  Record<string, SlotCustomData>
>;

export type UiCompatibilityCategory =
  | 'slotExpansionData'
  | 'cssLayout'
  | 'menuParams';

export type UiCategoryPathMap = Partial<
  Record<UiCompatibilityCategory, string>
>;

export interface EchoOperationOptions {
  renameFolders?: boolean;
  renameFiles?: boolean;
  applyMetadata?: boolean;
  generateConfig?: boolean;
  echoFighterName?: string;
  echoSourceFighters?: string[];
  duplicateCharacter?: boolean;
  duplicateNIndexOffset?: number;
  uiOutputModPath?: string;
  selectedCategories?: UiCompatibilityCategory[];
  categoryOutputPaths?: UiCategoryPathMap;
  categorySourceModPaths?: UiCategoryPathMap;
  autoSkipConflictingCategories?: boolean;
  uiCompatibilityProfile?: string;
}

export class SlotChanger {
  private static readonly ECHO_UI_LAYOUT_RELATIVE_PATH =
    'ui/layout/menu/chara_select/chara_select/layout.arc';

  private static readonly ECHO_UI_LAYOUT_COMPETE_RELATIVE_PATH =
    'ui/layout/menu/compe_chara_select/compe_chara_select/layout.arc';

  private static readonly ECHO_UI_PARAM_RELATIVE_PATH =
    'param/menu/chara_icon_arrangement.prc';

  private static readonly CSS_LAYOUT_RELATIVE_PATHS = [
    'ui/layout/menu/chara_select/chara_select/layout.arc',
    'ui/layout/menu/compe_chara_select/compe_chara_select/layout.arc',
    'ui/layout/menu/select_bg/select_bg/layout.arc',
    'ui/layout/menu/title/title/layout.arc',
  ];

  private static readonly MENU_PARAM_RELATIVE_PATHS = [
    'param/menu/chara_icon_arrangement.prc',
    'param/menu/chara_icon_arrangement.prcx',
  ];

  static sanitizeEchoFighterName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 10);
  }

  static replaceFighterTokenInPath(
    relativePath: string,
    sourceFighter: string,
    targetFighter: string,
  ): string {
    if (!sourceFighter || !targetFighter || sourceFighter === targetFighter) {
      return relativePath;
    }

    const escapedSource = sourceFighter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Replace token only when separated by path, underscore, dash, or dot boundaries.
    // Note: use escaped backslash in regex class so Windows separators are matched too.
    return relativePath.replace(
      new RegExp(`(^|[\\\\/_.-])${escapedSource}(?=($|[\\\\/_.-]))`, 'gi'),
      (_, prefix) => `${prefix}${targetFighter}`,
    );
  }

  static async renameEchoFighterReferences(
    modPath: string,
    sourceFighters: string[],
    targetFighter: string,
  ) {
    const normalizedTarget = this.sanitizeEchoFighterName(targetFighter);
    if (!normalizedTarget) return;

    const normalizedSources = Array.from(
      new Set(
        sourceFighters
          .map((fighter) => this.sanitizeEchoFighterName(fighter))
          .filter((fighter) => fighter && fighter !== normalizedTarget),
      ),
    ).sort((a, b) => b.length - a.length);

    if (normalizedSources.length === 0) {
      return;
    }

    const allPaths = await ModFileOperations.getAllModFiles(modPath);

    // Rename deeper paths first to avoid parent path invalidation.
    const sortedPaths = allPaths.sort((a, b) => {
      const depthA = a.split(/[\\/]/).length;
      const depthB = b.split(/[\\/]/).length;
      if (depthA === depthB) return b.length - a.length;
      return depthB - depthA;
    });

    for (const oldPath of sortedPaths) {
      const normalizedOldPath = oldPath.replace(/\\/g, '/').toLowerCase();

      // Keep legacy behavior: echo token replacement is only for UI chara assets.
      if (!normalizedOldPath.startsWith('ui/replace/chara/')) {
        continue;
      }

      let newPath = oldPath;

      for (const source of normalizedSources) {
        newPath = this.replaceFighterTokenInPath(newPath, source, normalizedTarget);
      }

      if (newPath === oldPath) {
        continue;
      }

      const oldAbsolutePath = path.join(modPath, oldPath);
      const newAbsolutePath = path.join(modPath, newPath);

      const oldExists = await ModFileOperations.fileExists(oldAbsolutePath);
      if (!oldExists) {
        continue;
      }

      const newExists = await ModFileOperations.fileExists(newAbsolutePath);
      if (newExists) {
        // Skip collisions to avoid destructive overwrites.
        continue;
      }

      await ModFileOperations.renameModFile(modPath, oldPath, newPath);
    }
  }

  static async isEchoUiOutputMod(candidatePath: string): Promise<boolean> {
    if (!candidatePath) return false;

    const hasLayout = await ModFileOperations.fileExists(
      path.join(candidatePath, this.ECHO_UI_LAYOUT_RELATIVE_PATH),
    );
    const hasCompeLayout = await ModFileOperations.fileExists(
      path.join(candidatePath, this.ECHO_UI_LAYOUT_COMPETE_RELATIVE_PATH),
    );
    const hasParam = await ModFileOperations.fileExists(
      path.join(candidatePath, this.ECHO_UI_PARAM_RELATIVE_PATH),
    );

    return hasLayout || hasCompeLayout || hasParam;
  }

  static async resolveMetadataOutputModPath(
    modPath: string,
    options: EchoOperationOptions,
  ): Promise<string> {
    const slotExpansionTarget = options.categoryOutputPaths?.slotExpansionData;

    if (slotExpansionTarget) {
      const isValidCategoryTarget = await this.isEchoUiOutputMod(
        slotExpansionTarget,
      );

      if (isValidCategoryTarget) {
        return slotExpansionTarget;
      }
    }

    if (options.uiOutputModPath) {
      const isValidExplicitTarget = await this.isEchoUiOutputMod(
        options.uiOutputModPath,
      );

      if (isValidExplicitTarget) {
        return options.uiOutputModPath;
      }
    }

    if (!options.duplicateCharacter) {
      return modPath;
    }

    const modsRoot = path.dirname(modPath);
    const knownCssModPath = path.join(modsRoot, '[UI] CSS 91-255 Slots');

    if (await this.isEchoUiOutputMod(knownCssModPath)) {
      return knownCssModPath;
    }

    return modPath;
  }

  static isCategorySelected(
    options: EchoOperationOptions,
    category: UiCompatibilityCategory,
  ): boolean {
    const selected = options.selectedCategories;

    if (!selected || selected.length === 0) {
      // Preserve legacy behavior unless explicit category selection is provided.
      return category === 'slotExpansionData';
    }

    return selected.includes(category);
  }

  static resolveCategoryOutputPath(
    modPath: string,
    options: EchoOperationOptions,
    category: UiCompatibilityCategory,
  ): string {
    return options.categoryOutputPaths?.[category] || modPath;
  }

  static resolveCategorySourcePath(
    modPath: string,
    options: EchoOperationOptions,
    category: UiCompatibilityCategory,
  ): string {
    return options.categorySourceModPaths?.[category] || modPath;
  }

  static async categoryHasCopyConflict(
    sourceModPath: string,
    targetModPath: string,
    relativePaths: string[],
  ): Promise<boolean> {
    if (!sourceModPath || !targetModPath || sourceModPath === targetModPath) {
      return false;
    }

    for (const relativePath of relativePaths) {
      const sourcePath = path.join(sourceModPath, relativePath);
      const targetPath = path.join(targetModPath, relativePath);

      const sourceExists = await ModFileOperations.fileExists(sourcePath);
      if (!sourceExists) continue;

      const targetExists = await ModFileOperations.fileExists(targetPath);
      if (targetExists) {
        return true;
      }
    }

    return false;
  }

  static async copyCategoryFiles(
    sourceModPath: string,
    targetModPath: string,
    relativePaths: string[],
  ): Promise<string[]> {
    const copiedPaths: string[] = [];

    if (!sourceModPath || !targetModPath) {
      return copiedPaths;
    }

    for (const relativePath of relativePaths) {
      const sourcePath = path.join(sourceModPath, relativePath);

      if (!(await ModFileOperations.fileExists(sourcePath))) {
        continue;
      }

      const targetPath = path.join(targetModPath, relativePath);
      await ModFileOperations.createDirectory(path.dirname(targetPath));
      await fse.copy(sourcePath, targetPath, {
        overwrite: true,
        errorOnExist: false,
      });

      copiedPaths.push(relativePath);
    }

    return copiedPaths;
  }

  static async applySelectedUiCategoryCopies(
    modPath: string,
    options: EchoOperationOptions,
  ): Promise<void> {
    const shouldAutoSkipConflicts = options.autoSkipConflictingCategories !== false;

    if (this.isCategorySelected(options, 'cssLayout')) {
      const sourcePath = this.resolveCategorySourcePath(
        modPath,
        options,
        'cssLayout',
      );
      const outputPath = this.resolveCategoryOutputPath(
        modPath,
        options,
        'cssLayout',
      );

      const hasConflict = await this.categoryHasCopyConflict(
        sourcePath,
        outputPath,
        this.CSS_LAYOUT_RELATIVE_PATHS,
      );

      if (hasConflict && shouldAutoSkipConflicts) {
        console.warn(
          '[changeSlots] Skipping cssLayout copy due to existing target files and auto-skip conflict mode.',
        );
      } else {
        await this.copyCategoryFiles(
          sourcePath,
          outputPath,
          this.CSS_LAYOUT_RELATIVE_PATHS,
        );
      }
    }

    if (this.isCategorySelected(options, 'menuParams')) {
      const sourcePath = this.resolveCategorySourcePath(
        modPath,
        options,
        'menuParams',
      );
      const outputPath = this.resolveCategoryOutputPath(
        modPath,
        options,
        'menuParams',
      );

      const hasConflict = await this.categoryHasCopyConflict(
        sourcePath,
        outputPath,
        this.MENU_PARAM_RELATIVE_PATHS,
      );

      if (hasConflict && shouldAutoSkipConflicts) {
        console.warn(
          '[changeSlots] Skipping menuParams copy due to existing target files and auto-skip conflict mode.',
        );
      } else {
        await this.copyCategoryFiles(
          sourcePath,
          outputPath,
          this.MENU_PARAM_RELATIVE_PATHS,
        );
      }
    }
  }

  static async changeSlots(
    modPath: string,
    slotAssignments: Map<string, Map<string, string>>,
    pathData: PathData,
    slotCustomNamesByFighter: SlotCustomNamesByFighter = {},
    options: EchoOperationOptions = {},
  ) {
    const changedPaths: string[] = [];
    const shouldApplySlotExpansionData = this.isCategorySelected(
      options,
      'slotExpansionData',
    );
    const shouldRenameFolders =
      shouldApplySlotExpansionData && options.renameFolders !== false;
    const shouldRenameFiles =
      shouldApplySlotExpansionData && options.renameFiles !== false;
    const shouldApplyMetadata =
      shouldApplySlotExpansionData && options.applyMetadata !== false;
    const shouldGenerateConfig =
      shouldApplySlotExpansionData && options.generateConfig !== false;
    const metadataOutputModPath = await this.resolveMetadataOutputModPath(
      modPath,
      options,
    );

    for (const fighterName of Object.keys(pathData)) {
      const defaultCustomNames = await this.getDefaultCustomNames(fighterName);
      const fighterAssignments = slotAssignments.get(fighterName);
      const fighterCustomNames = slotCustomNamesByFighter[fighterName] || {};

      if (!fighterAssignments) continue;

      const finalSlots = Array.from(fighterAssignments.values());

      const fighterTempMappings: {
        originalPath: string;
        tempPath: string;
        finalPath: string;
      }[] = [];

      if (shouldRenameFiles || shouldRenameFolders) {
        Object.keys(pathData[fighterName]).forEach((currentSlot) => {
          const newSlot = fighterAssignments.get(currentSlot);

          if (!newSlot) {
            return;
          }

          Object.values(
            pathData[fighterName][currentSlot].pathsToBeModified,
          ).forEach(({ original, normalized, type }) => {
            if (type === 'directory' && !shouldRenameFolders) {
              return;
            }

            if (type === 'file' && !shouldRenameFiles) {
              return;
            }

            let newNum = newSlot.replace('c', '');
            if (newNum.length === 1) newNum = '0' + newNum;

            if (!normalized) {
              console.warn(
                '[changeSlots] Normalized path is null for original path:',
                original,
              );
              return;
            }

            const newPath = normalized.replace('###', newNum);

            // Create temporary path in a slot-specific temp directory
            // This isolates temp files for each slot to prevent conflicts
            const tempPathParts = normalized.split(/[/\\]/);
            const lastPart = tempPathParts[tempPathParts.length - 1];

            tempPathParts[tempPathParts.length - 1] =
              `.temp_${currentSlot}_${lastPart}`;

            const tempPath = tempPathParts.join('/');

            fighterTempMappings.push({
              originalPath: original,
              tempPath: tempPath,
              finalPath: newPath,
            });
          });
        });
      }

      if (fighterTempMappings.length > 0) {
        for (const mapping of fighterTempMappings) {
          try {
            await ModFileOperations.renameModFile(
              modPath,
              mapping.originalPath.replace(/\\/g, '/'),
              mapping.tempPath.replace(/\\/g, '/'),
            );
          } catch (error) {
            console.error(
              `Error moving file to temp ${mapping.originalPath}:`,
              error,
            );

            throw new Error(
              `Failed to move file to temp ${mapping.originalPath}: ${error.message}`,
            );
          }
        }

        // Step 3: Move all files from temp paths to final paths
        console.log(
          '[changeSlots] Moving files from temporary to final paths...',
        );

        for (const mapping of fighterTempMappings) {
          try {
            await ModFileOperations.renameModFile(
              modPath,
              mapping.tempPath.replace(/\\/g, '/'),
              mapping.finalPath.replace(/\\/g, '/'),
            );

            changedPaths.push(mapping.finalPath);
          } catch (error) {
            console.error(
              `Error moving file from temp ${mapping.tempPath}:`,
              error,
            );
            throw new Error(
              `Failed to move file from temp ${mapping.tempPath}: ${error.message}`,
            );
          }
        }
      }

      const hasAnySlotAboveC07 = finalSlots.find(
        (slot) => parseInt(slot.replace('c', '')) > 7,
      );

      if (
        shouldApplyMetadata &&
        (hasAnySlotAboveC07 ||
          (fighterCustomNames && Object.keys(fighterCustomNames).length > 0))
      ) {
        try {
          // 1. Get the fighter folder name
          if (!fighterName) {
            console.log(
              '[changeSlots] Dossier fighter non trouvé, skip la partie Max Slots.',
            );
            // On skip, pas d'erreur bloquante
          } else {
            // 2. Read names.data to get fighter index
            const namesDataPath = path.join(PATHS.dataDir(), 'names.data');
            const namesData =
              await ModFileOperations.readModFile(namesDataPath);

            // 3. Find the fighter by internal name and get the index from the third column
            const lines = namesData.split(/\r?\n/);
            let fighterIndex = -1;

            for (const line of lines) {
              const parts = line.split(',').map((p) => p.trim());
              if (
                parts.length >= 3 &&
                parts[0].toLowerCase() === fighterName.trim().toLowerCase()
              ) {
                fighterIndex = parseInt(parts[2]);
                break;
              }
            }

            if (fighterIndex === -1)
              throw new Error(
                `Fighter name "${fighterName}" not found in names.data`,
              );

            // 4. Edit ui_chara_db.prcxml
            const pathParts = metadataOutputModPath.replace(/\\/g, '/').split('/');
            pathParts.pop();

            const prcXmlTemplatePath = path.join(
              PATHS.dataDir(),
              'ui_chara_db.prcxml',
            );

            let prcXmlContent =
              await ModFileOperations.readModFile(prcXmlTemplatePath);

            // Build all parameters for this fighter's struct
            const structParams: string[] = [];

            // Calculate the highest slot number for color_num
            const maxSlotNum = Math.max(
              ...finalSlots.map((slot) => parseInt(slot.replace('c', ''))),
            );
            const colorNum = maxSlotNum + 1;

            // Add color_num if the highest slot is > 7
            if (maxSlotNum > 7) {
              structParams.push(`<byte hash="color_num">${colorNum}</byte>`);
            }

            for (const slot of finalSlots) {
              const slotNum = parseInt(slot.replace('c', ''));

              let announcer = '';
              let customAnnouncer = '';

              if (
                fighterCustomNames &&
                fighterCustomNames[slot] &&
                fighterCustomNames[slot].announcer
              ) {
                customAnnouncer = announcer =
                  fighterCustomNames[slot].announcer;
              } else if (defaultCustomNames.announcer) {
                announcer = defaultCustomNames.announcer;
              }

              if (slotNum > 7 || customAnnouncer) {
                const hasCustomNames =
                  fighterCustomNames &&
                  Object.keys(fighterCustomNames).length;

                const nxyIndex = !hasCustomNames ? 0 : slotNum + 8;

                // Add nXY_index parameter
                structParams.push(
                  `<byte hash="n${String(slotNum).padStart(2, '0')}_index">${nxyIndex}</byte>`,
                );

                // Add custom announcer call if provided
                if (customAnnouncer) {
                  structParams.push(
                    `<hash40 hash="characall_label_c${String(nxyIndex).padStart(2, '0')}">${announcer}</hash40>`,
                  );
                }
              }
            }

            // Build a single struct with all parameters
            if (structParams.length > 0) {
              const structContent = `<struct index="${fighterIndex}">${structParams.join('')}</struct>`;
              const hashLine = new RegExp(
                `<hash40 index="${fighterIndex}">dummy<\\/hash40>`,
                'g',
              );

              prcXmlContent = prcXmlContent.replace(hashLine, structContent);
            }

            // Ensure the directory exists before writing the file
            const outputDir = `${metadataOutputModPath}/ui/param/database`;
            if (!(await ModFileOperations.fileExists(outputDir))) {
              await ModFileOperations.createDirectory(outputDir);
            }

            // Write the modified file to the mod folder
            await ModFileOperations.writeModFile(
              `${metadataOutputModPath}/ui/param/database/ui_chara_db.prcxml`,
              prcXmlContent,
            );
          }
        } catch (error) {
          console.error('Error editing ui_chara_db.prcxml:', error);
          throw new Error(`Error editing ui_chara_db.prcxml: ${error.message}`);
        }
      } else if (shouldApplyMetadata) {
        console.log(
          'Deleting ui_chara_db.prcxml as no slots above c07 and no custom names provided',
        );

        await ModFileOperations.deleteModFile(
          metadataOutputModPath,
          'ui/param/database/ui_chara_db.prcxml',
        );
      }

      // Update msg_name.xmsbt with custom names if provided (for all slots)
      if (
        shouldApplyMetadata &&
        ((fighterName && hasAnySlotAboveC07) ||
          (fighterCustomNames && Object.keys(fighterCustomNames).length > 0))
      ) {
        if (options.duplicateCharacter) {
          await EchoDuplicateService.applyCharacterDuplicateMetadata({
            modPath: metadataOutputModPath,
            fighterName,
            finalSlots,
            fighterCustomNames,
            defaultCustomNames,
            echoNameId: options.echoFighterName,
            nIndexOffset: options.duplicateNIndexOffset,
          });
        } else {
          await SlotChanger.updateMsgName(
            metadataOutputModPath,
            fighterName,
            finalSlots,
            fighterCustomNames,
            defaultCustomNames,
          );
        }
      }

      if (fighterName && shouldGenerateConfig) {
        await ConfigGenerator.init();
        const jsonCreator = new ConfigGenerator(modPath, fighterName);

        await jsonCreator.generateConfig(finalSlots);
      }
    }

    if (
      shouldApplySlotExpansionData &&
      options.echoFighterName &&
      options.echoSourceFighters?.length
    ) {
      await this.renameEchoFighterReferences(
        modPath,
        options.echoSourceFighters,
        options.echoFighterName,
      );
    }

    await this.applySelectedUiCategoryCopies(modPath, options);

    return changedPaths.length;
  }

  static async removeSlots(
    modPath: string,
    deletedSlots: Map<string, Set<string>>,
    pathData: PathData,
  ) {
    let deletedPaths = 0;

    for (const [fighterName, slots] of deletedSlots) {
      const fighterData = pathData[fighterName];

      for (const slot of slots) {
        if (!fighterData || !fighterData[slot]) continue;

        for (const { original } of Object.values(
          fighterData[slot].pathsToBeModified,
        )) {
          await ModFileOperations.deleteModFile(modPath, original);
          deletedPaths++;
        }
      }
    }

    return deletedPaths;
  }

  static async updateMsgName(
    modPath: string,
    fighterName: string,
    slots: string[],
    slotCustomNames: Record<string, SlotCustomData>,
    defaultCustomNames: SlotCustomData,
  ) {
    try {
      console.log('[updateMsgName] called');

      // Prepare XML content
      const xmlEntries: string[] = [];

      for (const slot of slots) {
        const slotNum = parseInt(slot.replace('c', ''));

        if (
          (slotNum <= 7 && !slotCustomNames[slot]) ||
          (!slotCustomNames[slot]?.cspName &&
            !slotCustomNames[slot]?.vsName &&
            !slotCustomNames[slot]?.boxingRing)
        ) {
          continue;
        }

        const names = {
          cspName:
            (slotCustomNames &&
              slotCustomNames[slot] &&
              slotCustomNames[slot].cspName) ||
            (defaultCustomNames &&
              defaultCustomNames[slot] &&
              defaultCustomNames[slot].cspName),
          vsName:
            (slotCustomNames &&
              slotCustomNames[slot] &&
              slotCustomNames[slot].vsName) ||
            (defaultCustomNames &&
              defaultCustomNames[slot] &&
              defaultCustomNames[slot].vsName),
          boxingRing:
            (slotCustomNames &&
              slotCustomNames[slot] &&
              slotCustomNames[slot].boxingRing) ||
            (defaultCustomNames &&
              defaultCustomNames[slot] &&
              defaultCustomNames[slot].boxingRing),
        };

        // Calculate the label index to match ui_chara_db.prcxml nXY_index value
        // This should always be slot number + 8 (same as nxyIndex in ui_chara_db.prcxml)
        const labelIndex = String(slotNum + 8).padStart(2, '0');

        const cspName = names.cspName || '';
        const vsName = names.vsName || (cspName ? cspName.toUpperCase() : '');
        const vsNameUpper = vsName ? vsName.toUpperCase() : '';
        const boxingRingName = names.boxingRing || '';

        xmlEntries.push(
          `\t<entry label="nam_chr0_${labelIndex}_${fighterName}">`,
        );
        xmlEntries.push(`\t\t<text>${this.escapeXml(cspName)}</text>`);
        xmlEntries.push(`\t</entry>`);

        xmlEntries.push(
          `\t<entry label="nam_chr1_${labelIndex}_${fighterName}">`,
        );
        xmlEntries.push(`\t\t<text>${this.escapeXml(cspName)}</text>`);
        xmlEntries.push(`\t</entry>`);

        xmlEntries.push(
          `\t<entry label="nam_chr2_${labelIndex}_${fighterName}">`,
        );
        xmlEntries.push(`\t\t<text>${this.escapeXml(vsName)}</text>`);
        xmlEntries.push(`\t</entry>`);

        xmlEntries.push(
          `\t<entry label="nam_chr3_${labelIndex}_${fighterName}">`,
        );
        xmlEntries.push(`\t\t<text>${this.escapeXml(vsNameUpper)}</text>`);
        xmlEntries.push(`\t</entry>`);

        xmlEntries.push(
          `\t<entry label="nam_stage_name_${labelIndex}_${fighterName}">`,
        );
        xmlEntries.push(`\t\t<text>${this.escapeXml(boxingRingName)}</text>`);
        xmlEntries.push(`\t</entry>`);
      }

      if (xmlEntries.length === 0) {
        console.log('[updateMsgName] No custom names to write');
        return;
      }

      // Build complete XML file
      const xmlContent = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<xmsbt>',
        ...xmlEntries,
        '</xmsbt>',
      ].join('\n');

      // Ensure the directory exists
      const outputDir = `${modPath}/ui/message`;
      if (!(await ModFileOperations.fileExists(outputDir))) {
        await ModFileOperations.createDirectory(outputDir);
      }

      // Write the file
      await ModFileOperations.writeModFile(
        `${modPath}/ui/message/msg_name.xmsbt`,
        xmlContent,
      );
      console.log('[updateMsgName] Successfully wrote msg_name.xmsbt');
    } catch (error) {
      console.error('[updateMsgName] Error:', error);
      throw error;
    }
  }

  static escapeXml(str) {
    if (!str) return '';

    return str
      .replace(/\\n/g, '\n') // Convert \n escape sequences to actual newlines
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  static async readExistingCustomNames(
    modPath: string,
    fighterName: string,
    slots: string[],
  ): Promise<Record<string, SlotCustomData>> {
    const customNames = {};
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      trimValues: true,
    });

    try {
      // First, read ui_chara_db.prcxml to get the actual labelIndex for each slot
      const slotToLabelIndex = {};
      const prcxmlPath = `${modPath}/ui/param/database/ui_chara_db.prcxml`;

      if (await ModFileOperations.fileExists(prcxmlPath)) {
        const prcxmlContent = await ModFileOperations.readModFile(prcxmlPath);

        try {
          const prcxmlData = parser.parse(prcxmlContent);

          // Navigate to the struct array (assuming it's under a root element)
          // Adjust this path based on actual XML structure
          const structs = prcxmlData?.struct || [];
          const structArray = Array.isArray(structs) ? structs : [structs];

          for (const slot of slots) {
            const slotNum = parseInt(slot.replace('c', ''));

            // Look for byte elements with hash="nXY_index"
            let nxyIndexValue: number | null = null;

            // Search through structs for the byte element
            for (const struct of structArray) {
              if (!struct || !struct.byte) continue;

              const bytes = Array.isArray(struct.byte)
                ? struct.byte
                : [struct.byte];

              // Try without leading zeros first
              let nxyByte = bytes.find(
                (b) => b?.['@_hash'] === `n${slotNum}_index`,
              );

              // If not found, try with leading zeros
              if (!nxyByte) {
                nxyByte = bytes.find(
                  (b) =>
                    b?.['@_hash'] ===
                    `n${String(slotNum).padStart(2, '0')}_index`,
                );
              }

              if (nxyByte && nxyByte['#text'] !== undefined) {
                nxyIndexValue = parseInt(nxyByte['#text']);
                break;
              }
            }

            if (nxyIndexValue !== null) {
              slotToLabelIndex[slot] = nxyIndexValue;
            } else {
              // Fallback to default calculation
              slotToLabelIndex[slot] = slotNum + 8;
            }
          }
        } catch (parseError) {
          console.error(
            '[readExistingCustomNames] Error parsing prcxml:',
            parseError,
          );
          // If there's a parser error, use default calculation for all slots
          for (const slot of slots) {
            const slotNum = parseInt(slot.replace('c', ''));
            slotToLabelIndex[slot] = slotNum + 8;
          }
        }
      } else {
        // If prcxml doesn't exist, use default calculation for all slots
        for (const slot of slots) {
          const slotNum = parseInt(slot.replace('c', ''));
          slotToLabelIndex[slot] = slotNum + 8;
        }
      }

      // Read msg_name.xmsbt if it exists
      const msgNamePath = `${modPath}/ui/message/msg_name.xmsbt`;

      if (await ModFileOperations.fileExists(msgNamePath)) {
        const msgContent = await ModFileOperations.readModFile(msgNamePath);

        try {
          const msgData = parser.parse(msgContent);

          // Get the entries array
          const entries = msgData?.xmsbt?.entry || [];
          const entryArray = Array.isArray(entries) ? entries : [entries];

          for (const slot of slots) {
            const labelIndexRaw = slotToLabelIndex[slot];
            const labelIndexPadded = String(labelIndexRaw).padStart(2, '0');
            const labelIndexUnpadded = String(labelIndexRaw);

            // Find entries with specific labels - try both with and without leading zeros
            const cspEntry = entryArray.find(
              (e) =>
                e?.['@_label'] ===
                  `nam_chr1_${labelIndexPadded}_${fighterName}` ||
                e?.['@_label'] ===
                  `nam_chr1_${labelIndexUnpadded}_${fighterName}`,
            );

            const vsEntry = entryArray.find(
              (e) =>
                e?.['@_label'] ===
                  `nam_chr2_${labelIndexPadded}_${fighterName}` ||
                e?.['@_label'] ===
                  `nam_chr2_${labelIndexUnpadded}_${fighterName}`,
            );

            const vsEntryAlt = entryArray.find(
              (e) =>
                e?.['@_label'] ===
                  `nam_chr3_${labelIndexPadded}_${fighterName}` ||
                e?.['@_label'] ===
                  `nam_chr3_${labelIndexUnpadded}_${fighterName}`,
            );

            const boxingEntry = entryArray.find(
              (e) =>
                e?.['@_label'] ===
                  `nam_stage_name_${labelIndexPadded}_${fighterName}` ||
                e?.['@_label'] ===
                  `nam_stage_name_${labelIndexUnpadded}_${fighterName}`,
            );

            // Convert actual newlines to \n escape sequences for editing
            const cspText = (cspEntry?.text || '').replace(/\n/g, '\\n');
            const vsText = (vsEntry?.text || vsEntryAlt?.text || '').replace(
              /\n/g,
              '\\n',
            );
            const boxingText = (boxingEntry?.text || '').replace(/\n/g, '\\n');

            if (cspText || vsText || boxingText) {
              customNames[slot] = {
                cspName: cspText,
                vsName: vsText,
                boxingRing: boxingText,
                announcer: '',
              };
            }
          }
        } catch (parseError) {
          console.error(
            '[readExistingCustomNames] Error parsing msg_name.xmsbt:',
            parseError,
          );
        }
      }

      // Read announcer info from ui_chara_db.prcxml
      if (await ModFileOperations.fileExists(prcxmlPath)) {
        const prcxmlContent = await ModFileOperations.readModFile(prcxmlPath);

        try {
          const prcxmlData = parser.parse(prcxmlContent);

          // Get the structs and hash40 elements
          const structs = prcxmlData?.struct || [];
          const structArray = Array.isArray(structs) ? structs : [structs];

          for (const slot of slots) {
            const labelIndex = slotToLabelIndex[slot];
            const labelPadded = String(labelIndex).padStart(2, '0');

            // Search through structs for the hash40 element
            let announcerText = '';

            for (const struct of structArray) {
              if (!struct || !struct.hash40) continue;

              const hash40s = Array.isArray(struct.hash40)
                ? struct.hash40
                : [struct.hash40];

              const announcerElement = hash40s.find(
                (h) => h?.['@_hash'] === `characall_label_c${labelPadded}`,
              );

              if (announcerElement && announcerElement['#text']) {
                announcerText = announcerElement['#text'];
                break;
              }
            }

            if (announcerText) {
              if (!customNames[slot]) {
                customNames[slot] = {
                  cspName: '',
                  vsName: '',
                  boxingRing: '',
                  announcer: '',
                };
              }

              customNames[slot].announcer = announcerText;
            }
          }
        } catch (parseError) {
          console.error(
            '[readExistingCustomNames] Error parsing prcxml for announcer:',
            parseError,
          );
        }
      }
    } catch (error) {
      console.error('[readExistingCustomNames] Error:', error);
      // Return empty customNames on error
    }

    return customNames;
  }

  /**
   * Gets default custom names from messages.data file
   * @param {string} fighterNameInternal - Internal fighter name (e.g., 'mario', 'link')
   * @returns {Object} - Object with cspName, vsName, and boxingRing properties
   */
  static async getDefaultCustomNames(
    fighterNameInternal: string,
  ): Promise<SlotCustomData> {
    try {
      // Get the path to messages.data
      const messagesPath = path.join(PATHS.dataDir(), 'messages.data');

      if (!(await ModFileOperations.fileExists(messagesPath))) {
        console.warn('messages.data file not found');
        return {};
      }

      // Read and parse the XML file
      const xmlContent = await ModFileOperations.readModFile(messagesPath);
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text',
        parseAttributeValue: true,
        trimValues: true,
      });

      try {
        const xmlData = parser.parse(xmlContent);

        // Build label patterns
        const cspLabel = `nam_chr1_08_${fighterNameInternal}`;
        const vsLabel = `nam_chr2_08_${fighterNameInternal}`;
        const boxingRingLabel = `nam_stage_name_08_${fighterNameInternal}`;

        // Get entries array
        const entries = xmlData?.xmsbt?.entry || [];
        const entryArray = Array.isArray(entries) ? entries : [entries];

        // Find matching entries
        const cspEntry = entryArray.find((e) => e?.['@_label'] === cspLabel);
        const vsEntry = entryArray.find((e) => e?.['@_label'] === vsLabel);
        const boxingRingEntry = entryArray.find(
          (e) => e?.['@_label'] === boxingRingLabel,
        );

        return {
          cspName: cspEntry?.text || '',
          vsName: vsEntry?.text || '',
          boxingRing: boxingRingEntry?.text?.replace(/\n/g, ' ') || '',
          announcer: 'vc_narration_characall',
        };
      } catch (parseError) {
        console.error('Error parsing messages.data XML:', parseError);
        return {};
      }
    } catch (error) {
      console.error('Error reading messages.data:', error);
      return {};
    }
  }
}
