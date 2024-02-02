import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { SharedModule } from '../shared/shared.module';

@Module({
    providers: [RemindersService],
    exports: [RemindersService],
    imports: [SharedModule],
})
export class RemindersModule {}
