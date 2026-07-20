import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeWithAzure } from './azure.js';
import { demoAnalysis, demoCase } from './domain.js';

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe('Azure scope analysis', () => {
  it('keeps the secret server-side and validates grounded JSON', async () => {
    process.env.AZURE_AI_ENDPOINT = 'https://proxy.example.test';
    process.env.AZURE_AI_API_KEY = 'server-secret';
    process.env.AZURE_AI_DEPLOYMENT = 'gpt-5.4-mini';
    process.env.AZURE_AI_API_VERSION = '2024-10-21';

    const fakeFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ 'api-key': 'server-secret' });
      expect(String(init?.body)).not.toContain('server-secret');
      expect(JSON.parse(String(init?.body)).max_completion_tokens).toBe(2_000);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(demoAnalysis) } }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const result = await analyzeWithAzure(
      demoCase.scopeContent,
      demoCase.requestContent,
      fakeFetch as typeof fetch,
    );

    expect(result.analysis).toEqual(demoAnalysis);
    expect(result.model).toBe('gpt-5.4-mini');
    expect(result.usage.totalTokens).toBe(150);
  });

  it('rejects non-HTTPS endpoints before sending data', async () => {
    process.env.AZURE_AI_ENDPOINT = 'http://proxy.example.test';
    process.env.AZURE_AI_API_KEY = 'server-secret';
    const fakeFetch = vi.fn();

    await expect(
      analyzeWithAzure(demoCase.scopeContent, demoCase.requestContent, fakeFetch as typeof fetch),
    ).rejects.toThrow(/HTTPS/);
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});
