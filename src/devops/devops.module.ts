import { Module } from '@nestjs/common';
import { DevopsService } from './devops.service';
import { DevopsHandler } from './handlers/devops.handler';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  providers: [DevopsService, DevopsHandler],
  exports: [DevopsService, DevopsHandler],
})
export class DevopsModule {}
