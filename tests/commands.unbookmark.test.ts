import { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../src/cli/shared.js';
import { registerUnbookmarkCommand } from '../src/commands/unbookmark.js';
import { extractTweetId } from '../src/lib/extract-tweet-id.js';
import { TwitterClient } from '../src/lib/twitter-client.js';

describe('unbookmark command', () => {
  it('removes each provided tweet id or url', async () => {
    const program = new Command();
    const ctx = {
      resolveTimeoutFromOptions: () => undefined,
      resolveCredentialsFromOptions: async () => ({
        cookies: { authToken: 'auth', ct0: 'ct0', cookieHeader: 'auth=auth; ct0=ct0' },
        warnings: [],
      }),
      p: () => '',
      extractTweetId,
    } as unknown as CliContext;

    const unbookmarkSpy = vi.spyOn(TwitterClient.prototype, 'unbookmark').mockResolvedValue({ success: true });

    registerUnbookmarkCommand(program, ctx);

    await program.parseAsync([
      'node',
      'bird',
      'unbookmark',
      '1234567890123456789',
      'https://x.com/user/status/9876543210987654321',
    ]);

    expect(unbookmarkSpy).toHaveBeenCalledTimes(2);
    expect(unbookmarkSpy.mock.calls[0][0]).toBe('1234567890123456789');
    expect(unbookmarkSpy.mock.calls[1][0]).toBe('9876543210987654321');

    unbookmarkSpy.mockRestore();
  });

  it('exits with code 1 when any removal fails', async () => {
    const program = new Command();
    const ctx = {
      resolveTimeoutFromOptions: () => undefined,
      resolveCredentialsFromOptions: async () => ({
        cookies: { authToken: 'auth', ct0: 'ct0', cookieHeader: 'auth=auth; ct0=ct0' },
        warnings: [],
      }),
      p: () => '',
      extractTweetId,
    } as unknown as CliContext;

    const unbookmarkSpy = vi
      .spyOn(TwitterClient.prototype, 'unbookmark')
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'nope' });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    registerUnbookmarkCommand(program, ctx);

    try {
      await expect(program.parseAsync(['node', 'bird', 'unbookmark', '1', '2'])).rejects.toThrow('exit 1');
    } finally {
      unbookmarkSpy.mockRestore();
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
