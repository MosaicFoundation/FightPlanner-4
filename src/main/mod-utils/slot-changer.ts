import path from 'path';
import { XMLParser } from 'fast-xml-parser';

import { PathData } from './mod-scanner';
import { ModFileOperations } from '../mod-file-operations';
import { ConfigGenerator } from './config-generator';
import { PATHS } from '../config';

interface CustomData {
  cspName?: string;
  vsName?: string;
  boxingRing?: string;
  announcer?: string;
}

export class SlotChanger {
  static async changeSlots(
    modPath: string,
    slotAssignments: Map<string, string>,
    pathData: PathData,
    slotCustomNames: Record<string, CustomData> = {},
  ) {
    const changedPaths: string[] = [];

    const tempMappings: {
      originalPath: string;
      tempPath: string;
      finalPath: string;
    }[] = [];

    for (const fighterName of Object.keys(pathData)) {
      const defaultCustomNames = await this.getDefaultCustomNames(fighterName);
      const finalSlots = Array.from(slotAssignments.values());

      Object.keys(pathData[fighterName]).forEach((currentSlot) => {
        const newSlot = slotAssignments.get(currentSlot);

        if (!newSlot) {
          return;
        }

        Object.values(
          pathData[fighterName][currentSlot].pathsToBeModified,
        ).forEach(({ original, normalized }) => {
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

          tempMappings.push({
            originalPath: original,
            tempPath: tempPath,
            finalPath: newPath,
          });
        });
      });

      for (const mapping of tempMappings) {
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

      for (const mapping of tempMappings) {
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

      const hasAnySlotAboveC07 = finalSlots.find(
        (slot) => parseInt(slot.replace('c', '')) > 7,
      );

      if (
        hasAnySlotAboveC07 ||
        (slotCustomNames && Object.keys(slotCustomNames).length > 0)
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
            const pathParts = modPath.replace(/\\/g, '/').split('/');
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
                slotCustomNames &&
                slotCustomNames[slot] &&
                slotCustomNames[slot].announcer
              ) {
                customAnnouncer = announcer = slotCustomNames[slot].announcer;
              } else if (defaultCustomNames.announcer) {
                announcer = defaultCustomNames.announcer;
              }

              if (slotNum > 7 || customAnnouncer) {
                const nxyIndex = slotNum + 8;

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
            const outputDir = `${modPath}/ui/param/database`;
            if (!(await ModFileOperations.fileExists(outputDir))) {
              await ModFileOperations.createDirectory(outputDir);
            }

            // Write the modified file to the mod folder
            await ModFileOperations.writeModFile(
              `${modPath}/ui/param/database/ui_chara_db.prcxml`,
              prcXmlContent,
            );
          }
        } catch (error) {
          console.error('Error editing ui_chara_db.prcxml:', error);
          throw new Error(`Error editing ui_chara_db.prcxml: ${error.message}`);
        }
      }

      // Update msg_name.xmsbt with custom names if provided (for all slots)
      if (
        (fighterName && hasAnySlotAboveC07) ||
        (slotCustomNames && Object.keys(slotCustomNames).length > 0)
      ) {
        await SlotChanger.updateMsgName(
          modPath,
          fighterName,
          finalSlots,
          slotCustomNames,
          defaultCustomNames,
        );
      }

      if (fighterName) {
        await ConfigGenerator.init();
        const jsonCreator = new ConfigGenerator(modPath, fighterName);

        await jsonCreator.generateConfig(finalSlots);
      }

      return changedPaths.length;
    }
  }

  static async removeSlot(modPath: string, slot: string, pathData: PathData) {
    let deletedPaths = 0;

    for (const fighter in pathData) {
      for (const currentSlot in pathData[fighter]) {
        if (currentSlot !== slot) continue;

        for (const { original } of Object.values(
          pathData[fighter][currentSlot].pathsToBeModified,
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
    slotCustomNames: Record<string, CustomData>,
    defaultCustomNames: CustomData,
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
  ) {
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

            const boxingEntry = entryArray.find(
              (e) =>
                e?.['@_label'] ===
                  `nam_stage_name_${labelIndexPadded}_${fighterName}` ||
                e?.['@_label'] ===
                  `nam_stage_name_${labelIndexUnpadded}_${fighterName}`,
            );

            // Convert actual newlines to \n escape sequences for editing
            const cspText = (cspEntry?.text || '').replace(/\n/g, '\\n');
            const vsText = (vsEntry?.text || '').replace(/\n/g, '\\n');
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
  ): Promise<CustomData> {
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
