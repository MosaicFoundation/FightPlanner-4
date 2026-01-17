const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const execAsync = promisify(exec);

/**
 * Detect available drives on Windows
 * @returns {Promise<Array<{letter: string, label: string, type: string, path: string}>>}
 */
async function detectWindowsDrives() {
  if (process.platform !== 'win32') {
    return [];
  }

  try {
    // Use wmic to get drive information
    const { stdout } = await execAsync(
      'wmic logicaldisk get name,volumename,drivetype',
    );
    console.log('WMIC output:', stdout);

    // Split by lines and filter out headers and empty lines
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return false;
        const upperLine = line.toUpperCase();
        return (
          !upperLine.includes('NAME') &&
          !upperLine.includes('VOLUMENAME') &&
          !upperLine.includes('DRIVETYPE') &&
          /^[A-Z]:/.test(line)
        );
      });

    console.log('Filtered lines:', lines);

    const drives = [];
    for (const line of lines) {
      if (!line) continue;

      // Parse the line - format can vary: "C:    Windows    3" or "C:  Windows  3" or "C:              3"
      // Extract drive letter (should be at the start, format "X:")
      const driveMatch = line.match(/^([A-Z]):/i);
      if (!driveMatch) {
        console.log('No drive match for line:', line);
        continue;
      }

      const letter = driveMatch[1].toUpperCase();

      // Extract drive type (should be at the end, a single digit)
      const typeMatch = line.match(/\s+(\d+)\s*$/);
      if (!typeMatch) {
        console.log('No type match for line:', line);
        continue;
      }

      const type = typeMatch[1];

      // Extract volume name (everything between drive letter and type)
      let label = 'Local Disk';
      // Try to extract label - remove drive letter and type, get what's in between
      const labelPart = line
        .replace(/^[A-Z]:\s*/, '')
        .replace(/\s+\d+\s*$/, '')
        .trim();
      if (labelPart && labelPart.length > 0) {
        label = labelPart;
      }

      console.log(`Drive found: ${letter}:, label: ${label}, type: ${type}`);

      // Filter for removable drives (type 2) and fixed drives (type 3)
      // We include both because SD cards can sometimes show as fixed
      // Exclude C: drive (system drive)
      if ((type === '2' || type === '3') && letter !== 'C') {
        drives.push({
          letter: letter,
          label: label,
          type: type === '2' ? 'removable' : 'fixed',
          path: `${letter}:\\`,
        });
      }
    }

    console.log('Detected drives:', drives);

    // If no drives found with wmic, try fallback
    if (drives.length === 0) {
      console.log('No drives found with wmic, trying fallback method...');
      return await fallbackWindowsDetection();
    }

    return drives;
  } catch (error) {
    console.error('Error detecting drives with wmic:', error);
    return await fallbackWindowsDetection();
  }
}

/**
 * Fallback method for Windows drive detection
 */
async function fallbackWindowsDetection() {
  console.log('Using fallback drive detection...');
  const fallbackDrives = [];
  const driveLetters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  for (const letter of driveLetters) {
    // Exclude C: drive (system drive)
    if (letter === 'C') continue;

    const drivePath = `${letter}:\\`;
    try {
      if (fs.existsSync(drivePath)) {
        // Try to get volume label
        let label = 'Unknown';
        try {
          const { stdout } = await execAsync(
            `wmic logicaldisk where "name='${letter}:'" get volumename`,
          );
          const labelLines = stdout
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.toUpperCase().includes('VOLUMENAME'));
          if (labelLines.length > 0 && labelLines[0]) {
            label = labelLines[0];
          }
        } catch (e) {
          // Keep default label
        }

        fallbackDrives.push({
          letter: letter,
          label: label || 'Unknown',
          type: 'unknown',
          path: drivePath,
        });
        console.log(`Fallback: Found drive ${letter}:`);
      }
    } catch (e) {
      // Drive doesn't exist or isn't accessible
    }
  }

  console.log('Fallback detected drives:', fallbackDrives);
  return fallbackDrives;
}

/**
 * Detect available drives on Linux
 * @returns {Promise<Array<{letter: string, label: string, type: string, path: string}>>}
 */
async function detectLinuxDrives() {
  if (process.platform !== 'linux') {
    return [];
  }

  try {
    // Use lsblk to get mounted drives
    const { stdout } = await execAsync('lsblk -n -o MOUNTPOINT,LABEL,TYPE');
    const lines = stdout.split('\n').filter((line) => line.trim());

    const drives = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && parts[0] && parts[0] !== '') {
        const mountPoint = parts[0];
        const label = parts[1] || 'Unknown';
        const type = parts[2] || 'unknown';

        // Skip root filesystem and system mounts
        if (
          mountPoint === '/' ||
          mountPoint.startsWith('/boot') ||
          mountPoint.startsWith('/sys') ||
          mountPoint.startsWith('/proc')
        ) {
          continue;
        }

        // Extract a simple identifier from mount point
        const mountName =
          path.basename(mountPoint) || mountPoint.replace(/\//g, '_');

        drives.push({
          letter: mountName,
          label: label,
          type: type === 'disk' ? 'fixed' : 'removable',
          path: mountPoint,
        });
      }
    }

    return drives;
  } catch (error) {
    console.error('Error detecting drives on Linux:', error);

    // Fallback: use df to get mounted filesystems
    try {
      const { stdout } = await execAsync(
        'df -h | grep -E "^/dev/" | awk \'{print $6}\'',
      );
      const mountPoints = stdout
        .split('\n')
        .filter((mp) => mp.trim() && mp !== '/');

      return mountPoints.map((mountPoint) => ({
        letter: path.basename(mountPoint) || mountPoint.replace(/\//g, '_'),
        label: 'Unknown',
        type: 'unknown',
        path: mountPoint.trim(),
      }));
    } catch (fallbackError) {
      console.error('Fallback drive detection failed:', fallbackError);
      return [];
    }
  }
}

/**
 * Detect available drives on macOS
 * @returns {Promise<Array<{letter: string, label: string, type: string, path: string}>>}
 */
async function detectMacOSDrives() {
  if (process.platform !== 'darwin') {
    return [];
  }

  try {
    // Use diskutil to list mounted volumes
    const { stdout } = await execAsync(
      'diskutil list -plist external physical',
    );

    // Parse plist output (simplified - for production, use a plist parser)
    // For now, use df as a simpler alternative
    const { stdout: dfOutput } = await execAsync(
      'df -h | grep -E "^/dev/disk"',
    );
    const lines = dfOutput.split('\n').filter((line) => line.trim());

    const drives = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 6) {
        const mountPoint = parts[parts.length - 1];

        // Skip system volumes
        if (
          mountPoint === '/' ||
          mountPoint.startsWith('/System') ||
          mountPoint.startsWith('/private')
        ) {
          continue;
        }

        // Get volume name
        let label = 'Unknown';
        try {
          const { stdout: labelOutput } = await execAsync(
            `diskutil info "${mountPoint}" | grep "Volume Name" | awk -F': ' '{print $2}'`,
          );
          label = labelOutput.trim() || 'Unknown';
        } catch (e) {
          // Use mount point name as fallback
          label = path.basename(mountPoint) || 'Unknown';
        }

        drives.push({
          letter: path.basename(mountPoint) || mountPoint.replace(/\//g, '_'),
          label: label,
          type: 'removable',
          path: mountPoint,
        });
      }
    }

    return drives;
  } catch (error) {
    console.error('Error detecting drives on macOS:', error);
    return [];
  }
}

/**
 * Detect available drives on all platforms
 * @returns {Promise<Array<{letter: string, label: string, type: string, path: string}>>}
 */
async function detectDrives() {
  if (process.platform === 'win32') {
    return await detectWindowsDrives();
  } else if (process.platform === 'linux') {
    return await detectLinuxDrives();
  } else if (process.platform === 'darwin') {
    return await detectMacOSDrives();
  } else {
    console.warn(
      `Drive detection not implemented for platform: ${process.platform}`,
    );
    return [];
  }
}

/**
 * Check if a drive path exists and is accessible
 * @param {string} drivePath - Path to check (e.g., "E:\\" on Windows, "/media/user/disk" on Linux)
 * @returns {boolean}
 */
function isDriveAccessible(drivePath) {
  try {
    return fs.existsSync(drivePath);
  } catch (error) {
    return false;
  }
}

/**
 * Check if a path contains Switch SD card structure
 * @param {string} basePath - Base path to check
 * @returns {boolean}
 */
function isSwitchSdCard(basePath) {
  try {
    const atmospherePath = path.join(basePath, 'atmosphere');
    const exists = fs.existsSync(atmospherePath);
    return exists;
  } catch (error) {
    return false;
  }
}

module.exports = {
  detectWindowsDrives,
  detectLinuxDrives,
  detectMacOSDrives,
  detectDrives,
  isDriveAccessible,
  isSwitchSdCard,
};
