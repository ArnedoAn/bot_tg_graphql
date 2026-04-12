import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FinanceService } from './finance.service';
import { SharedModule } from '../shared/shared.module';
import { FinanceHandler } from './handlers/finance.handler';
import { FinanceStatusCronService } from './finance-status-cron.service';

@Module({
  providers: [FinanceService, FinanceHandler, FinanceStatusCronService],
  exports: [FinanceHandler, FinanceStatusCronService],
  imports: [SharedModule, HttpModule],
})
export class FinanceModule {}
