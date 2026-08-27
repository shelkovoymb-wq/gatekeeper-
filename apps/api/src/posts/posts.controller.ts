import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Auth, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AddonsService } from '../addons/addons.service.js';
import { PostsService, type PostInput } from './posts.service.js';
import { MAX_FILE_BYTES } from './media-storage.js';

/** Код платной опции, которой открывается весь этот раздел. */
const ADDON = 'posting';

function clientIdOf(auth: AuthContext): string {
  if (!auth.clientId) {
    throw new BadRequestException('этот аккаунт не привязан к проекту (владелец платформы)');
  }
  return auth.clientId;
}

/** То, что отдаёт multer. Полный тип тянуть ради четырёх полей незачем. */
interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Controller('v1/cabinet/posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly addons: AddonsService,
  ) {}

  /**
   * Гейт опции стоит на каждом маршруте раздела, а не только на списке:
   * иначе истёкшая подписка перестаёт показывать посты, но продолжает их
   * публиковать.
   */
  private async gate(auth: AuthContext): Promise<string> {
    const clientId = clientIdOf(auth);
    await this.addons.assertAccess(clientId, ADDON);
    return clientId;
  }

  @Get()
  async list(@Auth() auth: AuthContext) {
    return this.posts.list(await this.gate(auth));
  }

  @Post()
  async create(@Auth() auth: AuthContext, @Body() dto: PostInput) {
    return this.posts.create(await this.gate(auth), dto ?? {});
  }

  @Put(':id')
  async update(@Auth() auth: AuthContext, @Param('id') id: string, @Body() dto: PostInput) {
    return this.posts.update(await this.gate(auth), id, dto ?? {});
  }

  @Post(':id/schedule')
  async schedule(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.posts.schedule(await this.gate(auth), id);
  }

  @Post(':id/unschedule')
  async unschedule(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.posts.unschedule(await this.gate(auth), id);
  }

  @Delete(':id')
  async remove(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.posts.remove(await this.gate(auth), id);
  }

  @Post('media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  async upload(@Auth() auth: AuthContext, @UploadedFile() file?: UploadedFileLike) {
    const clientId = await this.gate(auth);
    if (!file?.buffer?.length) throw new BadRequestException('файл не пришёл');
    return this.posts.upload(clientId, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
  }
}
