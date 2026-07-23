import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ACCESS_QUEUE, type RevokeJob } from '../queue/queue.module.js';

/** Продюсер задач отзыва доступа. */
@Injectable()
export class AccessQueueProducer {
  constructor(@Inject(ACCESS_QUEUE) private readonly queue: Queue<RevokeJob>) {}

  async enqueueRevoke(job: RevokeJob): Promise<void> {
    // jobId по подписчику+причине — дедуп повторных постановок в окне.
    await this.queue.add('revoke', job, {
      jobId: `revoke:${job.subscriberId}:${job.reason}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }
}
