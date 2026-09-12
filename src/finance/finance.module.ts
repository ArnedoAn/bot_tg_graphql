import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { SharedModule } from '../shared/shared.module';
import { FinanceHandler } from './handlers/finance.handler';
import { FinanceWizardHandler } from './handlers/finance.wizard.handler';
import { FinanceBatchHandler } from './handlers/finance.batch.handler';
import { FinanceStatusHandler } from './handlers/finance.status.handler';
import { FinanceStatusCronService } from './finance-status-cron.service';

@Module({
  providers: [
    FinanceService,
    FinanceHandler,
    FinanceWizardHandler,
    FinanceBatchHandler,
    FinanceStatusHandler,
    FinanceStatusCronService,
  ],
  exports: [FinanceHandler, FinanceStatusCronService],
  imports: [SharedModule],
})
export class FinanceModule {}
