import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FinanceService } from './finance.service';
import { SharedModule } from '../shared/shared.module';
import { FinanceHandler } from './handlers/finance.handler';

@Module({
  providers: [FinanceService, FinanceHandler],
  exports: [FinanceHandler],
  imports: [SharedModule, HttpModule],
})
export class FinanceModule {}
