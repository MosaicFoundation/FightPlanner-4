import path from 'path';
import { promises as fsp } from 'node:fs';
import * as fse from 'fs-extra';

/**
 * Utility functions for mod file operations
 */
export class ModFileOperations {
  static async getAllModFiles(
    modPath: string,
    arrayOfFiles: string[] = [],
  ): Promise<string[]> {
    const files = await fsp.readdir(modPath);

    await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(modPath, file);
        const stat = await fsp.stat(filePath);

        if (stat.isDirectory()) {
          arrayOfFiles.push(filePath);
          await ModFileOperations.getAllModFiles(filePath, arrayOfFiles);
        } else {
          arrayOfFiles.push(filePath);
        }
      }),
    );

    return arrayOfFiles;
  }

  static async renameModFile(
    modPath: string,
    oldPath: string,
    newPath: string,
  ): Promise<boolean> {
    try {
      const fullOldPath = path.join(modPath, oldPath);
      const fullNewPath = path.join(modPath, newPath);

      // Create parent directories if they don't exist
      await fsp.mkdir(path.dirname(fullNewPath), { recursive: true });

      // Perform the rename
      try {
        await fsp.rename(fullOldPath, fullNewPath);
      } catch (error: any) {
        if (error.code === 'EPERM') {
          // If rename fails due to EPERM, try copying and deleting
          await fse.copy(fullOldPath, fullNewPath);
          await fse.remove(fullOldPath);
        } else {
          throw error;
        }
      }

      return true;
    } catch (error) {
      console.error('Error renaming mod file:', error);
      throw error;
    }
  }

  static async deleteModFile(
    modPath: string,
    filePath: string,
  ): Promise<boolean> {
    const fullPath = path.join(modPath, filePath);
    try {
      const stat = await fsp.stat(fullPath);

      if (stat.isDirectory()) {
        await fsp.rm(fullPath, { recursive: true });
      } else {
        await fsp.unlink(fullPath);
      }

      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.warn('File or directory does not exist:', fullPath);
        return false; // Indicate that the file or directory was not found
      }

      console.error('Error deleting mod file:', error);

      throw error;
    }
  }

  static async writeModFile(
    filePath: string,
    content: string,
  ): Promise<boolean> {
    try {
      // File doesn't exist, check content for encoding hints
      if (
        content.includes('encoding="utf-16"') ||
        content.includes("encoding='utf-16'")
      ) {
        // Check if content already starts with BOM (U+FEFF / UTF-16 LE BOM character)
        const hasBOM = content.charCodeAt(0) === 0xfeff;

        // If BOM already present, remove it from content since we'll add it as bytes
        const contentWithoutBOM = hasBOM ? content.substring(1) : content;

        // Add BOM for UTF-16LE and write as buffer
        const bom = Buffer.from([0xff, 0xfe]);
        const contentBuffer = Buffer.from(contentWithoutBOM, 'utf16le');
        const fullBuffer = Buffer.concat([bom, contentBuffer]);

        await fsp.writeFile(filePath, fullBuffer);

        return true;
      }

      await fsp.writeFile(filePath, content, 'utf8');

      return true;
    } catch (error) {
      console.error('Error writing mod file:', error);
      throw error;
    }
  }

  static async readModFile(filePath: string): Promise<string> {
    try {
      return await fsp.readFile(filePath, 'utf8');
    } catch (error) {
      console.error('Error reading mod file:', error);
      throw error;
    }
  }

  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsp.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async createDirectory(dirPath: string): Promise<void> {
    try {
      await fsp.mkdir(dirPath, { recursive: true });
    } catch (error) {
      console.error('Error creating directory:', error);
      throw error;
    }
  }
}
