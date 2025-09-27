import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { DiskOption } from '../Option';
import { IStorage } from './iStorage';

/**
 * LocalAdapter for local file storage
 */
export class LocalAdapter implements IStorage {
  private _config: DiskOption;

  constructor(config: DiskOption) {
    this._config = config;
  }

  /**
   * returns file url
   * @param key
   * @returns
   */
  url(key: string): string {
    return `${process.env.APP_URL}${this._config.connection.publicUrl}${key}`;
  }

  /**
   * check if file exists
   * @param key
   * @returns
   */
  async isExists(key: string): Promise<boolean> {
    try {
      if (fsSync.existsSync(`${this._config.connection.rootUrl}/${key}`)) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  /**
   * get data
   * @param key
   */
  async get(key: string) {
    try {
      const data = await fs.readFile(
        `${this._config.connection.rootUrl}/${key}`,
        {
          encoding: 'utf8',
        },
      );
      return data;
    } catch (err) {
      console.log(err);
    }
  }

  /**
   * put data
   * @param key
   * @param value
   */
  async put(key: string, value: any) {
    try {
      const filePath = path.join(this._config.connection.rootUrl, key);
      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(filePath, value);
    } catch (err) {
      console.log(err);
    }
  }
  /**
   * delete data
   * @param key
   */
  async delete(key: string) {
    try {
      await fs.unlink(`${this._config.connection.rootUrl}/${key}`);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error(err);
    }
  }

  // lagre file in local storage
  async putLargeFile(
    key: string,
    stream: NodeJS.ReadableStream,
    onProgress?: (bytesWritten: number, totalBytes: number) => void
  ): Promise<void> {
    try {
      const filePath = path.join(this._config.connection.rootUrl, key);
      const dirPath = path.dirname(filePath);

      // Create directory if it doesn't exist
      await fs.mkdir(dirPath, { recursive: true });

      // Create write stream
      const writeStream = fsSync.createWriteStream(filePath);
      let bytesWritten = 0;

      // Stream data chunk by chunk
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
          bytesWritten += chunk.length;
          if (onProgress) {
            onProgress(bytesWritten, null); // totalBytes unknown for streams
          }
        });

        stream.on('end', () => {
          writeStream.end();
          resolve();
        });

        stream.on('error', (error) => {
          writeStream.destroy();
          reject(error);
        });

        stream.pipe(writeStream);
      });
    } catch (error) {
      throw error;
    }
  }
}
