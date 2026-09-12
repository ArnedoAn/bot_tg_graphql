import { ConfigService } from '@nestjs/config';
import { DevopsService } from './devops.service';
import { DnsApiService } from './dns-api.service';

describe('DevopsService (DNS API migration)', () => {
  let service: DevopsService;
  let dnsApi: jest.Mocked<DnsApiService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    configService = {
      get: jest.fn((k: string) =>
        k === 'DNS_ZONE' ? 'toothless.codes' : undefined,
      ),
    } as unknown as jest.Mocked<ConfigService>;

    dnsApi = {
      getPublicIp: jest.fn().mockResolvedValue('9.9.9.9'),
      createRecord: jest.fn((input: any) =>
        Promise.resolve({
          id: '1',
          name: input.name,
          type: input.type ?? 'A',
          content: input.content,
          proxied: input.proxied ?? true,
          ttl: input.ttl ?? 1,
        }),
      ),
      listRecords: jest.fn().mockResolvedValue([]),
      deleteRecord: jest
        .fn()
        .mockResolvedValue({ deleted: 'x', record_ids: [] }),
      forceUpdate: jest.fn(),
      checkHealth: jest.fn(),
    } as unknown as jest.Mocked<DnsApiService>;

    service = new DevopsService(configService, dnsApi);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addDNSSubdomain', () => {
    it('maps FQDN and calls createRecord with sanitized slug', async () => {
      const result = await service.addDNSSubdomain('API');

      expect(dnsApi.createRecord).toHaveBeenCalledWith({
        zone: 'toothless.codes',
        name: 'api.toothless.codes',
        content: '9.9.9.9',
        type: 'A',
        proxied: true,
        ttl: 1,
      });
      expect(result).toEqual({
        id: '1',
        name: 'api.toothless.codes',
        type: 'A',
        content: '9.9.9.9',
        proxied: true,
        ttl: 1,
      });
    });
  });

  describe('deleteDNSSubdomain', () => {
    it('calls deleteRecord with FQDN and zone', async () => {
      const result = await service.deleteDNSSubdomain('api');

      expect(dnsApi.deleteRecord).toHaveBeenCalledWith(
        'api.toothless.codes',
        'toothless.codes',
      );
      expect(result).toEqual({ deleted: 'x', record_ids: [] });
    });
  });

  describe('executeDNSUpdate', () => {
    it('calls forceUpdate and reports failure when updated is false', async () => {
      dnsApi.forceUpdate.mockResolvedValue({
        updated: false,
        exit_code: 1,
        ip: 'x',
      });

      const result = await service.executeDNSUpdate();

      expect(dnsApi.forceUpdate).toHaveBeenCalled();
      expect(result.updated).toBe(false);
      expect(result).toEqual({ updated: false, exit_code: 1, ip: 'x' });
    });

    it('reports success when updated is true', async () => {
      dnsApi.forceUpdate.mockResolvedValue({
        updated: true,
        exit_code: 0,
        ip: '9.9.9.9',
      });

      const result = await service.executeDNSUpdate();

      expect(result.updated).toBe(true);
      expect(result).toEqual({ updated: true, exit_code: 0, ip: '9.9.9.9' });
    });
  });

  describe('testConnection', () => {
    it('returns true when checkHealth reports ok', async () => {
      dnsApi.checkHealth.mockResolvedValue({ ok: true });

      const result = await service.testConnection();

      expect(result).toBe(true);
    });

    it('returns false when checkHealth reports not ok', async () => {
      dnsApi.checkHealth.mockResolvedValue({ ok: false });

      const result = await service.testConnection();

      expect(result).toBe(false);
    });
  });
});
