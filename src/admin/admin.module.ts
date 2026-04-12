import { Module } from '@nestjs/common';
import { AdminHandler } from './admin.handler';
import { SharedModule } from '../shared/shared.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [SharedModule, FinanceModule],
  providers: [AdminHandler],
  exports: [AdminHandler],
})
export class AdminModule {}
