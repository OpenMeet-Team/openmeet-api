import { loadContrailCommunity } from './contrail-loader';

describe('loadContrailCommunity', () => {
  it('should resolve the ESM community package and expose createCommunityIntegration', async () => {
    const community = await loadContrailCommunity();
    expect(typeof community.createCommunityIntegration).toBe('function');
  });
});
