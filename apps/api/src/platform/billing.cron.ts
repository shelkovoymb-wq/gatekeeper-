import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PlatformService } from './platform.service.js';

/**
 * Планировщик платформенного биллинга.
 *  - 1-го числа в 03:00 UTC: генерирует счета за ЗАКРЫТЫЙ прошлый месяц.
 *  - ежедневно в 04:00 UTC: помечает неоплаченные счета просроченными.
 * Все операции идемпотентны (генерация — upsert без перезаписи оплаченных).
 */
@Injectable()
export class BillingCron {
  private readonly logger = new Logger(BillingCron.name);
  private running = false;

  constructor(private readonly platform: PlatformService) {}

  @Cron('0 3 1 * *')
  async monthlyInvoices(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const period = PlatformService.previousMonth();
      const res = await this.platform.generateInvoices(period);
      this.logger.log(
        `monthly billing: period ${period.start}..${period.end}, ` +
          `clients=${res.clients} created=${res.created} updated=${res.updated}`,
      );
    } catch (e) {
      this.logger.error(`monthly billing error: ${String(e)}`);
    } finally {
      this.running = false;
    }
  }

  @Cron('0 4 * * *')
  async dailyOverdue(): Promise<void> {
    try {
      const res = await this.platform.markOverdue(7);
      if (res.overdue > 0) this.logger.log(`marked overdue: ${res.overdue}`);
    } catch (e) {
      this.logger.error(`overdue sweep error: ${String(e)}`);
    }
  }
}
