import { Module } from '@nestjs/common';
import { DevopsService } from './devops.service';
import { DevopsHandler } from './handlers/devops.handler';
import { SharedModule } from '../shared/shared.module';
import { DnsApiService } from './dns-api.service';

@Module({
  imports: [SharedModule],
  providers: [DevopsService, DevopsHandler, DnsApiService],
  exports: [DevopsService, DevopsHandler, DnsApiService],
})
export class DevopsModule {}
