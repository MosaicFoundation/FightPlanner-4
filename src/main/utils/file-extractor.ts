import path from 'path';
import { app } from 'electron';
import Seven from 'node-7z';
import child_process, { execSync } from 'child_process';
import fs from 'fs';

export class FileExtractor {
  private static get7ZipPath(): string | undefined {
    const binaryNames =
      process.platform === 'win32'
        ? ['7z', '7zz', '7za']
        : ['7z', '7zz', '7za'];

    const command = process.platform === 'win32' ? 'where' : 'which';

    for (const binaryName of binaryNames) {
      try {
        execSync(`${command} ${binaryName}`, { stdio: 'pipe' });
        console.log(`Found ${binaryName} in system PATH`);
        return binaryName;
      } catch {}
    }

    // Fallback to bundled version
    console.log('No 7-Zip binary found in PATH, using bundled version');

    let sevenZipBin: string | undefined;

    switch (process.platform) {
      case 'darwin':
        sevenZipBin = '7zz';
        break;
      case 'win32':
        sevenZipBin = '7z.exe';
        break;
      default:
        throw new Error('7zip not found and no bundled version for this OS');
    }

    return path.join(app.getAppPath(), 'tools', sevenZipBin);
  }

  private static async extractWith7Zip(filePath: string, extractTo: string) {
    return new Promise<void>((resolve, reject) => {
      const sevenZipPath = this.get7ZipPath();

      console.log('Using 7-Zip from:', sevenZipPath);

      const seven = Seven.extractFull(filePath, extractTo, {
        $progress: false,
        $bin: sevenZipPath,
      });

      seven.on('end', () => {
        if (!this.verifyExtraction(extractTo)) {
          reject(new Error('No files found after extraction'));
          return;
        }

        resolve();
      });

      seven.on('error', (err) => {
        console.error(`7-Zip extraction failed: ${err}`);
        reject(err);
      });
    });
  }

  private static async extractWithTar(filePath: string, extractTo: string) {
    return new Promise<void>((resolve, reject) => {
      child_process.exec(
        `tar -xf "${filePath}" -C "${extractTo}"`,
        async (error) => {
          if (error) {
            console.error('Tar extraction error:', error);
            reject(error);
            return;
          }

          if (!this.verifyExtraction(extractTo)) {
            reject(new Error('No files found after extraction'));
            return;
          }

          resolve();
        },
      );
    });
  }

  private static verifyExtraction(extractTo: string) {
    try {
      const contents = fs.readdirSync(extractTo).filter((f) => {
        const fullPath = path.join(extractTo, f);
        return (
          fs.existsSync(fullPath) &&
          (fs.statSync(fullPath).isDirectory() || !f.match(/\.(rar|zip|7z)$/i))
        );
      });

      console.log('Extracted contents:', contents);
      return contents.length > 0;
    } catch (error) {
      console.error('Verification error:', error);
      return false;
    }
  }

  static async extractArchive(filePath: string, extractTo: string) {
    let fallbackToTar = false;

    try {
      const ext = path.extname(filePath).toLowerCase();
      fallbackToTar = ['.rar', '.7z', '.zip'].includes(ext);

      if (fallbackToTar) {
        await this.extractWith7Zip(filePath, extractTo);
      } else {
        await this.extractWithTar(filePath, extractTo);
      }
    } catch (error) {
      console.error(`Primary extraction failed, trying fallback:`, error);

      if (fallbackToTar) {
        await this.extractWithTar(filePath, extractTo);
      } else {
        await this.extractWith7Zip(filePath, extractTo);
      }
    }
  }
}
