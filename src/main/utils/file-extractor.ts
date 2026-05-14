import path from 'path';
import { app } from 'electron';
import Seven from 'node-7z';
import child_process, { execSync } from 'child_process';
import fs from 'fs';

type ArchiveKind = 'zip' | 'rar' | '7z' | 'tar' | 'gzip' | 'bzip2' | 'xz' | 'unknown';

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
      } catch { }
    }

    // Fallback to bundled version
    console.log('No 7-Zip binary found in PATH, using bundled version');

    let sevenZipBin: string | undefined;

    switch (process.platform) {
      case 'darwin':
      case 'linux':
        sevenZipBin = '7zz';
        break;
      case 'win32':
        sevenZipBin = '7z.exe';
        break;
      default:
        throw new Error('7zip not found and no bundled version for this OS');
    }

    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'tools', sevenZipBin);
    } else {
      return path.join(app.getAppPath(), 'tools', sevenZipBin);
    }
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
        reject(err);
      });
    });
  }

  private static async extractWithTar(filePath: string, extractTo: string) {
    return new Promise<void>((resolve, reject) => {
      const child = child_process.spawn('tar', ['-xf', filePath, '-C', extractTo]);

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`tar extraction failed with code ${code}`));
          return;
        }

        if (!this.verifyExtraction(extractTo)) {
          reject(new Error('No files found after extraction'));
          return;
        }

        resolve();
      });

      child.on('error', reject);
    });
  }

  private static async extractWithUnzip(filePath: string, extractTo: string) {
    return new Promise<void>((resolve, reject) => {
      const child = child_process.spawn('unzip', ['-o', '-q', filePath, '-d', extractTo]);
      child.on('close', (code) => {
        if (code === 0 || code === 1) {
          if (!this.verifyExtraction(extractTo)) {
            reject(new Error('No files found after unzip extraction'));
            return;
          }
          resolve();
        } else {
          reject(new Error(`unzip exited with code ${code}`));
        }
      });
      child.on('error', (err) => {
        reject(err);
      });
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

  private static getArchiveKind(filePath: string): ArchiveKind {
    const ext = path.extname(filePath).toLowerCase();

    try {
      const buffer = fs.readFileSync(filePath);

      if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
        return 'zip';
      }

      if (buffer.length >= 7 && buffer.subarray(0, 7).toString('ascii') === 'Rar!\x1a\x07') {
        return 'rar';
      }

      if (
        buffer.length >= 6 &&
        buffer[0] === 0x37 &&
        buffer[1] === 0x7a &&
        buffer[2] === 0xbc &&
        buffer[3] === 0xaf &&
        buffer[4] === 0x27 &&
        buffer[5] === 0x1c
      ) {
        return '7z';
      }

      if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
        return 'gzip';
      }

      if (buffer.length >= 3 && buffer.subarray(0, 3).toString('ascii') === 'BZh') {
        return 'bzip2';
      }

      if (
        buffer.length >= 6 &&
        buffer[0] === 0xfd &&
        buffer.subarray(1, 6).toString('ascii') === '7zXZ'
      ) {
        return 'xz';
      }

      if (buffer.length >= 262 && buffer.subarray(257, 262).toString('ascii') === 'ustar') {
        return 'tar';
      }
    } catch (error) {
      console.warn('[FileExtractor] Failed to inspect archive signature:', error);
    }

    if (ext === '.zip') return 'zip';
    if (ext === '.rar') return 'rar';
    if (ext === '.7z') return '7z';
    if (ext === '.tar') return 'tar';
    if (ext === '.gz' || ext === '.tgz') return 'gzip';
    if (ext === '.bz2') return 'bzip2';
    if (ext === '.xz') return 'xz';

    return 'unknown';
  }

  private static async extractWithSystem7Zip(filePath: string, extractTo: string) {
    const commands = ['7z', '7zz', '7za'];
    let commandToUse: string | null = null;

    for (const cmd of commands) {
      try {
        execSync(`which ${cmd}`, { stdio: 'ignore' });
        commandToUse = cmd;
        break;
      } catch {
        // Try the next binary name.
      }
    }

    if (!commandToUse) {
      throw new Error(
        "Cannot extract this archive. Please install the 'p7zip-full' package (or equivalent) in your system.",
      );
    }

    return new Promise<void>((resolve, reject) => {
      const child = child_process.spawn(commandToUse!, ['x', '-y', `-o${extractTo}`, filePath]);
      child.on('close', (code) => {
        if (code === 0 || code === 1 || code === 2) {
          if (this.verifyExtraction(extractTo)) {
            resolve();
          } else {
            reject(new Error(`System ${commandToUse} extracted successfully but output dir is empty`));
          }
        } else {
          reject(new Error(`System ${commandToUse} failed with code ${code}`));
        }
      });
      child.on('error', reject);
    });
  }

  static async extractArchive(filePath: string, extractTo: string) {
    if (!fs.existsSync(extractTo)) {
      fs.mkdirSync(extractTo, { recursive: true });
    }

    try {
      await this.extractWith7Zip(filePath, extractTo);
    } catch (sevenZipError: any) {
      console.log('[FileExtractor] bundled 7-Zip extraction failed or binary missing, trying fallback...', sevenZipError?.message || sevenZipError);

      const archiveKind = this.getArchiveKind(filePath);
      const ext = path.extname(filePath).toLowerCase();
      console.log(`[FileExtractor] Detected archive kind: ${archiveKind} (${ext || 'no extension'})`);

      if (archiveKind === 'zip') {
        try {
          await this.extractWithUnzip(filePath, extractTo);
          return;
        } catch (unzipError: any) {
          throw new Error(
            `ZIP extraction failed. 7-Zip error: ${sevenZipError?.message || sevenZipError}. unzip error: ${unzipError?.message || unzipError}`,
          );
        }
      }

      if (archiveKind === '7z' || archiveKind === 'rar') {
        console.log(`[FileExtractor] Trying to extract ${archiveKind} using system 7z/7zz/7za...`);
        try {
          await this.extractWithSystem7Zip(filePath, extractTo);
          return;
        } catch (system7zError: any) {
          console.log('[FileExtractor] System 7z/7za fallback failed:', system7zError?.message || system7zError);
          throw system7zError;
        }
      }

      if (
        archiveKind === 'tar' ||
        archiveKind === 'gzip' ||
        archiveKind === 'bzip2' ||
        archiveKind === 'xz'
      ) {
        await this.extractWithTar(filePath, extractTo);
      } else {
        throw new Error(
          `Downloaded file is not a recognized archive (${ext || 'no extension'}). 7-Zip error: ${sevenZipError?.message || sevenZipError}`,
        );
      }
    }
  }
  static async extractFppMetadata(filePath: string, extractTo: string): Promise<void> {
    if (!fs.existsSync(extractTo)) fs.mkdirSync(extractTo, { recursive: true });

    let sevenZipPath: string | undefined;
    try {
      sevenZipPath = this.get7ZipPath();
    } catch (error) {
      if (process.platform === 'linux' || process.platform === 'darwin') {
        console.log('[FileExtractor] 7-Zip not found, falling back to native unzip for metadata extraction.');
        return new Promise((resolve, reject) => {
          const child = child_process.spawn('unzip', [
            '-q', '-o', filePath,
            'manifest.xml', 'downloads.json', 'thumbnail.*',
            '-d', extractTo
          ]);

          child.on('close', (code) => {
            if (code === 0 || code === 1 || code === 11) resolve();
            else reject(new Error(`unzip fallback metadata extraction failed with code ${code}`));
          });
          child.on('error', reject);
        });
      }
      throw error;
    }

    return new Promise((resolve, reject) => {
      const child = child_process.spawn(sevenZipPath!, [
        'e', filePath,
        `-o${extractTo}`,
        'manifest.xml',
        'downloads.json',
        'thumbnail.*',
        '-y'
      ]);

      child.on('close', (code) => {
        if (code === 0 || code === 1 || code === 2) {
          resolve();
        } else {
          reject(new Error(`7z metadata extraction failed with code ${code}`));
        }
      });
      child.on('error', reject);
    });
  }

  static async listFppContents(filePath: string): Promise<string[]> {
    let sevenZipPath: string | undefined;
    try {
      sevenZipPath = this.get7ZipPath();
    } catch (error) {
      if (process.platform === 'linux' || process.platform === 'darwin') {
        console.log('[FileExtractor] 7-Zip not found, falling back to native unzip for listing contents.');
        return new Promise((resolve, reject) => {
          const child = child_process.spawn('unzip', ['-Z1', filePath]);
          let output = '';
          child.stdout.on('data', (d) => output += d.toString());
          child.on('close', (code) => {
            if (code !== 0 && code !== 1) return reject(new Error(`unzip list failed with code ${code}`));
            resolve(output.split(/[\r\n]+/).map(line => line.trim()).filter(Boolean));
          });
          child.on('error', reject);
        });
      }
      throw error;
    }

    return new Promise((resolve, reject) => {
      const child = child_process.spawn(sevenZipPath!, [
        'l', '-slt', filePath
      ]);

      let output = '';
      child.stdout.on('data', (d) => output += d.toString());

      child.on('close', (code) => {
        if (code !== 0 && code !== 1 && code !== 2) {
          return reject(new Error(`7z list failed with code ${code}`));
        }

        const files: string[] = [];
        const lines = output.split(/[\r\n]+/);
        for (const line of lines) {
          if (line.startsWith('Path = ')) {
            const parsedPath = line.substring(7).trim();
            if (parsedPath && parsedPath !== '-' && !path.isAbsolute(parsedPath)) {
              files.push(parsedPath);
            }
          }
        }
        resolve(files);
      });
      child.on('error', reject);
    });
  }
}
