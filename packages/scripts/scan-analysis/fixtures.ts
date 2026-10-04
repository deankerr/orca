import type { RawScan } from '../../backend/convex/scan/collected'

/** Synthetic data for report verification; never presented as a real source observation. */
export function sampleScan(): RawScan {
  const entries = [
    'example/text-model',
    'example/second-model',
    'example/image-model',
    'google/lyria-example',
  ].map((id, index) => ({
    endpoints: Array.from({ length: 3 }, (_, endpoint) => ({
      context_length: [32_768, 131_072, 200_000][endpoint],
      id: `00000000-0000-4000-8000-${String(index * 3 + endpoint).padStart(12, '0')}`,
      model_variant_slug: id,
      pricing: { completion: ['0.000002', '0.000004', '0.000012'][endpoint], prompt: '0.000001' },
      provider_info: {
        displayName: `Example provider ${endpoint % 2}`,
        slug: `provider-${endpoint % 2}`,
      },
      provider_slug: `provider-${endpoint % 2}/region-${endpoint}`,
      quantization: endpoint === 0 ? null : 'fp8',
      stats: {
        p50_latency: endpoint + 0.25,
        p50_throughput: 50 + endpoint * 30,
        request_count: 120 + index,
      },
      status: 0,
      supported_parameters: endpoint === 0 ? ['tools', 'temperature'] : ['temperature'],
      variant: 'standard',
    })),
    model: {
      context_length: 200_000,
      description: 'Synthetic model for scan report verification.',
      input_modalities: ['text'],
      name: `Example model ${index + 1}`,
      output_modalities: [index === 2 ? 'image' : 'text'],
      permaslug: `${id}-v1`,
      slug: id,
    },
    model_id: id,
    variant: 'standard',
  }))

  return {
    entries: [
      ...entries,
      {
        endpoints: null,
        model: {
          input_modalities: ['text'],
          output_modalities: ['text'],
          permaslug: 'example/unlisted-v1',
          slug: 'example/unlisted',
        },
        model_id: 'example/unlisted',
        variant: 'standard',
      },
    ],
    scan_at: '2026-10-03T00:00:00.000Z',
  }
}
