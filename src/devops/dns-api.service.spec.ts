import axios, { AxiosError, AxiosResponse } from 'axios';
import { DnsApiService, DnsRecord, CreateRecordInput } from './dns-api.service';

type ConfigMock = {
  get: jest.Mock;
};

const TOKEN = 'tok';
const BASE = 'https://dns-api.homelab.local';
const ZONE = 'toothless.codes';

function axiosErrorWithResponse(
  status: number,
  data: unknown,
  message = 'request failed',
): AxiosError {
  const response = {
    status,
    data,
    headers: {},
    config: { headers: {} } as any,
  } as AxiosResponse;
  return new AxiosError(message, undefined, {} as any, {}, response);
}

function axiosErrorNoResponse(code: string, message: string): AxiosError {
  return new AxiosError(message, code);
}

describe('DnsApiService', () => {
  let service: DnsApiService;
  let configService: ConfigMock;
  let axiosGet: jest.SpiedFunction<typeof axios.get>;
  let axiosPost: jest.SpiedFunction<typeof axios.post>;
  let axiosDelete: jest.SpiedFunction<typeof axios.delete>;

  beforeEach(() => {
    axiosGet = jest.spyOn(axios, 'get');
    axiosPost = jest.spyOn(axios, 'post');
    axiosDelete = jest.spyOn(axios, 'delete');
    configService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'CF_DNS_API_TOKEN':
            return TOKEN;
          case 'DNS_API_BASE_URL':
            return BASE;
          case 'DNS_ZONE':
            return ZONE;
          default:
            return undefined;
        }
      }),
    };
    service = new DnsApiService(configService as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkHealth', () => {
    it('returns ok with public ip (no auth header)', async () => {
      axiosGet.mockResolvedValue({
        data: { ok: true, public_ip: '1.2.3.4' },
        status: 200,
      });
      const res = await service.checkHealth();
      expect(res).toEqual({ ok: true, public_ip: '1.2.3.4' });
      expect(axiosGet).toHaveBeenCalledWith(`${BASE}/api/health`, {
        timeout: 10000,
      });
    });

    it('returns ok:false when API reports down (503 body)', async () => {
      axiosGet.mockRejectedValue(
        axiosErrorWithResponse(503, { ok: false, error: 'ip fail' }),
      );
      const res = await service.checkHealth();
      expect(res).toEqual({ ok: false, error: 'ip fail' });
    });
  });

  describe('getPublicIp', () => {
    it('returns public ip from health endpoint', async () => {
      axiosGet.mockResolvedValue({
        data: { ok: true, public_ip: '9.9.9.9' },
        status: 200,
      });
      const ip = await service.getPublicIp();
      expect(ip).toBe('9.9.9.9');
      expect(axiosGet).toHaveBeenCalledWith(`${BASE}/api/health`, {
        timeout: 10000,
      });
    });
  });

  describe('listRecords', () => {
    it('calls /api/records with zone and Bearer header', async () => {
      const records: DnsRecord[] = [
        {
          id: '1',
          name: 'x.toothless.codes',
          type: 'A',
          content: '1.2.3.4',
          proxied: true,
          ttl: 1,
        },
      ];
      axiosGet.mockResolvedValue({ data: records, status: 200 });
      const res = await service.listRecords();
      expect(res).toEqual(records);
      expect(axiosGet).toHaveBeenCalledWith(`${BASE}/api/records?zone=${ZONE}`, {
        timeout: 10000,
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
    });
  });

  describe('createRecord', () => {
    it('applies defaults type A proxied true ttl 1', async () => {
      const record: DnsRecord = {
        id: '1',
        name: 'x.toothless.codes',
        type: 'A',
        content: '1.2.3.4',
        proxied: true,
        ttl: 1,
      };
      axiosPost.mockResolvedValue({ data: record, status: 201 });
      const res = await service.createRecord({
        name: 'x.toothless.codes',
        content: '1.2.3.4',
      });
      expect(res).toEqual(record);
      expect(axiosPost).toHaveBeenCalledWith(
        `${BASE}/api/records`,
        {
          zone: ZONE,
          name: 'x.toothless.codes',
          content: '1.2.3.4',
          type: 'A',
          proxied: true,
          ttl: 1,
        },
        {
          timeout: 10000,
          headers: { Authorization: `Bearer ${TOKEN}` },
        },
      );
    });

    it('lets caller override defaults', async () => {
      const record: DnsRecord = {
        id: '2',
        name: 'y.toothless.codes',
        type: 'CNAME',
        content: 'target',
        proxied: false,
        ttl: 300,
      };
      axiosPost.mockResolvedValue({ data: record, status: 201 });
      const input: CreateRecordInput = {
        zone: 'other.codes',
        name: 'y.toothless.codes',
        content: 'target',
        type: 'CNAME',
        proxied: false,
        ttl: 300,
      };
      const res = await service.createRecord(input);
      expect(res).toEqual(record);
      expect(axiosPost).toHaveBeenCalledWith(
        `${BASE}/api/records`,
        {
          zone: 'other.codes',
          name: 'y.toothless.codes',
          content: 'target',
          type: 'CNAME',
          proxied: false,
          ttl: 300,
        },
        expect.any(Object),
      );
    });
  });

  describe('deleteRecord', () => {
    it('calls DELETE with name and zone', async () => {
      const body = { deleted: 'x.toothless.codes', record_ids: ['1'] };
      axiosDelete.mockResolvedValue({ data: body, status: 200 });
      const res = await service.deleteRecord('x.toothless.codes');
      expect(res).toEqual(body);
      expect(axiosDelete).toHaveBeenCalledWith(
        `${BASE}/api/records/x.toothless.codes?zone=${ZONE}`,
        {
          timeout: 10000,
          headers: { Authorization: `Bearer ${TOKEN}` },
        },
      );
    });
  });

  describe('forceUpdate', () => {
    it('POSTs /api/ip with Bearer header', async () => {
      const body = { updated: true, exit_code: 0, ip: '1.2.3.4' };
      axiosPost.mockResolvedValue({ data: body, status: 200 });
      const res = await service.forceUpdate();
      expect(res).toEqual(body);
      expect(axiosPost).toHaveBeenCalledWith(
        `${BASE}/api/ip`,
        {},
        {
          timeout: 10000,
          headers: { Authorization: `Bearer ${TOKEN}` },
        },
      );
    });
  });

  describe('error handling', () => {
    const cases: Array<[number, string]> = [
      [401, 'unauthorized'],
      [400, 'missing fields'],
      [404, 'record not found'],
      [502, 'cf error'],
    ];

    it.each(cases)(
      'maps HTTP %i error with body.error',
      async (status, bodyError) => {
        axiosGet.mockRejectedValue(
          axiosErrorWithResponse(status, { error: bodyError }),
        );
        await expect(service.listRecords()).rejects.toThrow(
          `DNS API error (HTTP ${status}): ${bodyError}`,
        );
      },
    );

    it('maps timeout (ECONNABORTED) to timeout message', async () => {
      axiosGet.mockRejectedValue(
        axiosErrorNoResponse('ECONNABORTED', 'timeout'),
      );
      await expect(service.listRecords()).rejects.toThrow(
        'DNS API request timed out after 10000ms',
      );
    });

    it('maps network-down (no response) to cannot-reach message', async () => {
      axiosGet.mockRejectedValue(
        axiosErrorNoResponse('ENOTFOUND', 'getaddrinfo ENOTFOUND'),
      );
      await expect(service.listRecords()).rejects.toThrow(
        `Cannot reach DNS API at ${BASE}: getaddrinfo ENOTFOUND`,
      );
    });
  });

  describe('constructor', () => {
    it('throws when CF_DNS_API_TOKEN is missing', () => {
      const cfg = { get: jest.fn(() => undefined) };
      expect(() => new DnsApiService(cfg as any)).toThrow(
        'CF_DNS_API_TOKEN is required for the DNS API client',
      );
    });

    it('strips trailing slash from base url', async () => {
      const cfg = {
        get: jest.fn((key: string) => {
          if (key === 'CF_DNS_API_TOKEN') return TOKEN;
          if (key === 'DNS_API_BASE_URL')
            return 'https://dns-api.homelab.local/';
          return undefined;
        }),
      };
      const svc = new DnsApiService(cfg as any);
      axiosGet.mockResolvedValue({
        data: { ok: true, public_ip: '1.1.1.1' },
        status: 200,
      });
      const res = await svc.checkHealth();
      expect(res).toEqual({ ok: true, public_ip: '1.1.1.1' });
      expect(axiosGet).toHaveBeenCalledWith(
        'https://dns-api.homelab.local/api/health',
        { timeout: 10000 },
      );
    });
  });
});
