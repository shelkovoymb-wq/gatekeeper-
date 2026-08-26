import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';

/** Куда кладём вложения до первой отправки в Telegram. */
export const UPLOADS_ROOT = process.env.UPLOADS_DIR ?? '/data/uploads';

/** Ограничения Bot API на загрузку: фото 10 МБ, остальное 50 МБ. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

const PHOTO_MIME = /^image\/(jpeg|png|webp)$/;
const VIDEO_MIME = /^video\//;

/** Путь внутри хранилища: <clientId>/<uuid><ext> и ничего другого. */
const REL_PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}(\.[A-Za-z0-9]{1,10})?$/;

/** Тип вложения по MIME. Gif и tiff Telegram фотографией не примет — это документ. */
export function mediaTypeFor(mime: string): 'photo' | 'video' | 'document' {
  if (PHOTO_MIME.test(mime)) return 'photo';
  if (VIDEO_MIME.test(mime)) return 'video';
  return 'document';
}

/** Расширение из имени файла — только буквы и цифры, без точек и слэшей. */
export function safeExtension(fileName: string | undefined): string {
  const ext = extname(fileName ?? '').toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

/**
 * Проверка пути, пришедшего от клиента.
 *
 * Путь возвращается браузеру после загрузки и приходит обратно при сохранении
 * поста — то есть им управляет клиент. Без проверки сюда приезжает
 * `../../etc/passwd` или чужой клиентский каталог.
 */
export function assertOwnedPath(clientId: string, relPath: string): string {
  if (!REL_PATH_RE.test(relPath)) throw new BadRequestException('некорректный путь вложения');
  if (!relPath.startsWith(`${clientId}/`)) throw new ForbiddenException('чужое вложение');
  return relPath;
}

export function assertSize(mediaType: string, size: number): void {
  const limit = mediaType === 'photo' ? MAX_PHOTO_BYTES : MAX_FILE_BYTES;
  if (size > limit) {
    throw new BadRequestException(`файл больше ${Math.round(limit / 1024 / 1024)} МБ`);
  }
}

/** Хранилище вложений на диске. Живут они недолго — до первой публикации. */
@Injectable()
export class MediaStorage {
  private readonly logger = new Logger(MediaStorage.name);

  absolute(relPath: string): string {
    return join(UPLOADS_ROOT, relPath);
  }

  async save(
    clientId: string,
    file: { buffer: Buffer; originalName?: string; mimeType?: string },
  ): Promise<{ storagePath: string; mediaType: 'photo' | 'video' | 'document'; size: number }> {
    const mediaType = mediaTypeFor(file.mimeType ?? '');
    assertSize(mediaType, file.buffer.length);

    const dir = join(UPLOADS_ROOT, clientId);
    await mkdir(dir, { recursive: true });
    const relPath = `${clientId}/${randomUUID()}${safeExtension(file.originalName)}`;
    await writeFile(join(UPLOADS_ROOT, relPath), file.buffer);
    return { storagePath: relPath, mediaType, size: file.buffer.length };
  }

  async remove(relPath: string | null | undefined): Promise<void> {
    if (!relPath || !REL_PATH_RE.test(relPath)) return;
    try {
      await rm(join(UPLOADS_ROOT, relPath), { force: true });
    } catch (e) {
      this.logger.warn(`не удалось убрать ${relPath}: ${String(e)}`);
    }
  }

  /**
   * Убрать брошенные загрузки: файл залили, пост не сохранили. Без этого диск
   * растёт молча и однажды кончается посреди сборки.
   *
   * `keep` — пути, на которые ещё ссылаются неопубликованные посты. Их не
   * трогаем ни при каком возрасте: пост могли запланировать на месяц вперёд.
   */
  async sweep(keep: ReadonlySet<string>, olderThanHours = 48): Promise<number> {
    const cutoff = Date.now() - olderThanHours * 3_600_000;
    let removed = 0;
    let dirs: string[];
    try {
      dirs = await readdir(UPLOADS_ROOT);
    } catch {
      return 0; // каталога ещё нет — чистить нечего
    }
    for (const dir of dirs) {
      let files: string[];
      try {
        files = await readdir(join(UPLOADS_ROOT, dir));
      } catch {
        continue;
      }
      for (const name of files) {
        if (keep.has(`${dir}/${name}`)) continue;
        const full = join(UPLOADS_ROOT, dir, name);
        try {
          const info = await stat(full);
          if (info.mtimeMs < cutoff) {
            await rm(full, { force: true });
            removed += 1;
          }
        } catch {
          /* файл исчез сам — не мешает */
        }
      }
    }
    return removed;
  }
}
