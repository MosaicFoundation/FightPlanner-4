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

  static async extractArchive(filePath: string, extractTo: string) {
    if (!fs.existsSync(extractTo)) {
      fs.mkdirSync(extractTo, { recursive: true });
    }

    try {
      await this.extractWith7Zip(filePath, extractTo);
    } catch (sevenZipError: any) {
      console.log('[FileExtractor] bundled 7-Zip extraction failed or binary missing, trying fallback...', sevenZipError?.message || sevenZipError);

      const ext = path.extname(filePath).toLowerCase();

      // For .zip on Linux/Mac, try native unzip
      if ((process.platform === 'linux' || process.platform === 'darwin') && ext === '.zip') {
        try {
          await this.extractWithUnzip(filePath, extractTo);
          return;
        } catch (unzipError: any) {
          console.log('[FileExtractor] unzip fallback also failed, trying tar...', unzipError?.message || unzipError);
        }
      }

      // For .7z or .rar on Linux/Mac, try to use system installed p7zip-full (7z or 7za)
      if ((process.platform === 'linux' || process.platform === 'darwin') && (ext === '.7z' || ext === '.rar')) {
        console.log(`[FileExtractor] Trying to extract ${ext} using system 7z/7za...`);
        try {
          // Try '7z' first, then '7za'
          const commands = ['7z', '7za'];
          let commandToUse: string | null = null;

          for (const cmd of commands) {
            try {
              execSync(`which ${cmd}`, { stdio: 'ignore' });
              commandToUse = cmd;
              break;
            } catch (e) {
              // Ignore failure, try next
            }
          }

          if (commandToUse) {
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
          } else {
            throw new Error("Cannot extract .7z or .rar archives. Please install the 'p7zip-full' package (or equivalent) in your system.");
          }
        } catch (system7zError: any) {
          console.log('[FileExtractor] System 7z/7za fallback failed:', system7zError?.message || system7zError);
          throw system7zError; // Rethrow since tar won't work on these formats
        }
      }

      // For .tar, .tar.gz, .tgz, .tar.bz2 etc, tar works great
      if (ext === '.zip' || ext.includes('.tar') || ext === '.gz' || ext === '.bz2' || ext === '.xz') {
        await this.extractWithTar(filePath, extractTo);
      } else {
        throw new Error(`Archive format '${ext}' cannot be extracted by any available fallbacks.`);
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
