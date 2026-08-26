import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AddonsModule } from '../addons/addons.module.js';
import { TelegramCoreModule } from '../telegram/telegram-core.module.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';
import { PostPublisher } from './post-publisher.js';
import { PostsWorker } from './posts.worker.js';
import { PostsCron } from './posts.cron.js';
import { MediaStorage } from './media-storage.js';

@Module({
  imports: [AuthModule, AddonsModule, TelegramCoreModule],
  controllers: [PostsController],
  providers: [PostsService, PostPublisher, PostsWorker, PostsCron, MediaStorage],
  exports: [PostsService],
})
export class PostsModule {}
