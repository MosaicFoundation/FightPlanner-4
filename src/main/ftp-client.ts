import * as ftp from 'basic-ftp';
import { enterPassiveModeIPv4 } from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';

export default class FTPClient {
  client: ftp.Client;

  constructor() {
    this.client = new ftp.Client();
    this.client.prepareTransfer = enterPassiveModeIPv4;
  }

  async connect(host, port = 5000, user = 'ftp', password = 'ftp') {
    try {
      await this.client.access({
        host: host,
        port: port,
        user: user,
        password: password,
        secure: false,
      });
      console.log(`Connected to FTP server at ${host}:${port}`);
      return true;
    } catch (error) {
      console.error('FTP connection error:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      this.client.close();
      console.log('FTP connection closed');
    } catch (error) {
      console.error('Error closing FTP connection:', error);
    }
  }

  async uploadDirectory(localPath, remotePath) {
    try {
      remotePath = remotePath.replace(/\\/g, '/');
      console.log(`Uploading directory: ${localPath} -> ${remotePath}`);

      const stats = fs.statSync(localPath);
      if (!stats.isDirectory()) {
        throw new Error(`${localPath} is not a directory`);
      }

      const files = fs.readdirSync(localPath);
      let uploadedCount = 0;

      for (const file of files) {
        const localFilePath = path.join(localPath, file);
        let remoteFilePath = `${remotePath}/${file}`;

        const fileStats = fs.statSync(localFilePath);

        if (fileStats.isDirectory()) {
          const count = await this.uploadDirectory(
            localFilePath,
            remoteFilePath,
          );
          uploadedCount += count;
        } else if (fileStats.isFile()) {
          const remoteDir = remotePath;
          try {
            await this.client.ensureDir(remoteDir);
          } catch (dirError) {
            console.warn(`Could not ensure dir ${remoteDir}, continuing...`);
          }

          await this.client.uploadFrom(localFilePath, remoteFilePath);
          uploadedCount++;
          console.log(`Uploaded: ${remoteFilePath}`);
        }
      }

      return uploadedCount;
    } catch (error) {
      console.error('Error uploading directory:', error);
      throw error;
    }
  }

  async uploadFile(localPath, remotePath) {
    try {
      const remoteDir = path.dirname(remotePath).replace(/\\/g, '/');
      await this.client.ensureDir(remoteDir);
      await this.client.uploadFrom(localPath, remotePath.replace(/\\/g, '/'));
      console.log(`Uploaded file: ${remotePath}`);
      return true;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  async list(remotePath = '.') {
    try {
      const files = await this.client.list(remotePath);
      return files;
    } catch (error) {
      console.error('Error listing directory:', error);
      throw error;
    }
  }

  async ensureDir(remotePath) {
    try {
      await this.client.ensureDir(remotePath);
      return true;
    } catch (error) {
      console.error('Error ensuring directory:', error);
      throw error;
    }
  }
}
