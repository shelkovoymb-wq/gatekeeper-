import { describe, it, expect } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { assertOwnedPath, assertSize, mediaTypeFor, safeExtension } from './media-storage.js';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const FILE = '33333333-3333-3333-3333-333333333333';

describe('Путь вложения', () => {
  it('свой путь проходит', () => {
    expect(assertOwnedPath(CLIENT, `${CLIENT}/${FILE}.jpg`)).toBe(`${CLIENT}/${FILE}.jpg`);
  });

  it('путь без расширения тоже валиден', () => {
    expect(assertOwnedPath(CLIENT, `${CLIENT}/${FILE}`)).toBe(`${CLIENT}/${FILE}`);
  });

  it('чужой каталог — 403', () => {
    // Путь возвращается браузеру и приходит обратно: им управляет клиент.
    expect(() => assertOwnedPath(CLIENT, `${OTHER}/${FILE}.jpg`)).toThrow(ForbiddenException);
  });

  it('обход каталога отвергается', () => {
    expect(() => assertOwnedPath(CLIENT, `${CLIENT}/../../etc/passwd`)).toThrow(BadRequestException);
    expect(() => assertOwnedPath(CLIENT, '../etc/passwd')).toThrow(BadRequestException);
    expect(() => assertOwnedPath(CLIENT, `/etc/passwd`)).toThrow(BadRequestException);
  });

  it('лишняя вложенность отвергается', () => {
    expect(() => assertOwnedPath(CLIENT, `${CLIENT}/sub/${FILE}.jpg`)).toThrow(BadRequestException);
  });

  it('пустой путь отвергается', () => {
    expect(() => assertOwnedPath(CLIENT, '')).toThrow(BadRequestException);
  });
});

describe('Тип вложения по MIME', () => {
  it('картинки, которые Telegram принимает фотографией', () => {
    expect(mediaTypeFor('image/jpeg')).toBe('photo');
    expect(mediaTypeFor('image/png')).toBe('photo');
    expect(mediaTypeFor('image/webp')).toBe('photo');
  });

  it('gif и tiff идут документом: фотографией Telegram их не примет', () => {
    expect(mediaTypeFor('image/gif')).toBe('document');
    expect(mediaTypeFor('image/tiff')).toBe('document');
  });

  it('видео', () => {
    expect(mediaTypeFor('video/mp4')).toBe('video');
  });

  it('всё прочее — документ', () => {
    expect(mediaTypeFor('application/pdf')).toBe('document');
    expect(mediaTypeFor('')).toBe('document');
  });
});

describe('Расширение файла', () => {
  it('берётся из имени', () => {
    expect(safeExtension('фото.JPG')).toBe('.jpg');
  });

  it('пустое, если расширения нет или оно странное', () => {
    expect(safeExtension('файл')).toBe('');
    expect(safeExtension(undefined)).toBe('');
    expect(safeExtension('x.тест')).toBe('');
    expect(safeExtension('x.verylongextension')).toBe('');
  });
});

describe('Размер файла', () => {
  it('фото до 10 МБ', () => {
    expect(() => assertSize('photo', 9 * 1024 * 1024)).not.toThrow();
    expect(() => assertSize('photo', 11 * 1024 * 1024)).toThrow(BadRequestException);
  });

  it('остальное до 50 МБ', () => {
    expect(() => assertSize('document', 49 * 1024 * 1024)).not.toThrow();
    expect(() => assertSize('video', 51 * 1024 * 1024)).toThrow(BadRequestException);
  });
});
