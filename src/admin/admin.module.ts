import { Module } from '@nestjs/common';
import { AdminHandler } from './admin.handler';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  providers: [AdminHandler],
  exports: [AdminHandler],
})
export class AdminModule {}
