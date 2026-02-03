import type { AbstractConstructor, Mixin, TwitterClientBase } from './twitter-client-base.js';
import { TWITTER_API_BASE, TWITTER_GRAPHQL_POST_URL, TWITTER_STATUS_UPDATE_URL } from './twitter-client-constants.js';
import { logger } from './logger.js';
import { buildTweetCreateFeatures, buildUserTweetsFeatures } from './twitter-client-features.js';
import type { CreateTweetResponse, TweetResult, TweetData, GraphqlTweetResult } from './twitter-client-types.js';
import { parseTweetsFromInstructions } from './twitter-client-utils.js';

export interface TwitterClientPostingMethods {
  tweet(text: string, mediaIds?: string[]): Promise<TweetResult>;
  reply(text: string, replyToTweetId: string, mediaIds?: string[]): Promise<TweetResult>;
}

export function withPosting<TBase extends AbstractConstructor<TwitterClientBase>>(
  Base: TBase,
): Mixin<TBase, TwitterClientPostingMethods> {
  abstract class TwitterClientPosting extends Base {
    // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor requirement.
    constructor(...args: any[]) {
      super(...args);
    }

    /**
     * Post a new tweet
     */
    async tweet(text: string, mediaIds?: string[]): Promise<TweetResult> {
      const variables = {
        tweet_text: text,
        dark_request: false,
        media: {
          media_entities: (mediaIds ?? []).map((id) => ({ media_id: id, tagged_users: [] })),
          possibly_sensitive: false,
        },
        semantic_annotation_ids: [],
      };

      const features = buildTweetCreateFeatures();

      return this.createTweet(variables, features);
    }

    /**
     * Reply to an existing tweet
     */
    async reply(text: string, replyToTweetId: string, mediaIds?: string[]): Promise<TweetResult> {
      const variables = {
        tweet_text: text,
        reply: {
          in_reply_to_tweet_id: replyToTweetId,
          exclude_reply_user_ids: [],
        },
        dark_request: false,
        media: {
          media_entities: (mediaIds ?? []).map((id) => ({ media_id: id, tagged_users: [] })),
          possibly_sensitive: false,
        },
        semantic_annotation_ids: [],
      };

      const features = buildTweetCreateFeatures();

      return this.createTweet(variables, features);
    }

    private async createTweet(
      variables: Record<string, unknown>,
      features: Record<string, boolean>,
    ): Promise<TweetResult> {
      const tweetText = typeof variables.tweet_text === 'string' ? variables.tweet_text : '';
      const mediaCount = Array.isArray((variables.media as { media_entities?: unknown[] })?.media_entities)
        ? (variables.media as { media_entities: unknown[] }).media_entities.length
        : 0;
      const isReply = 'reply' in variables;

      logger.info('createTweet started', {
        textPreview: tweetText.slice(0, 80),
        mediaCount,
        isReply,
      });

      await this.ensureClientUserId();
      let queryId = await this.getQueryId('CreateTweet');
      let urlWithOperation = `${TWITTER_API_BASE}/${queryId}/CreateTweet`;

      const buildBody = () => JSON.stringify({ variables, features, queryId });
      let body = buildBody();

      try {
        const headers = { ...this.getHeaders(), referer: 'https://x.com/compose/post' };
        logger.debug('Attempting primary GraphQL endpoint', { url: urlWithOperation });
        let response = await this.fetchWithTimeout(urlWithOperation, {
          method: 'POST',
          headers,
          body,
        });
        logger.debug('Primary endpoint response', { status: response.status, ok: response.ok });

        // Twitter increasingly prefers POST to /i/api/graphql with queryId in the payload.
        // If the operation URL 404s, retry the generic endpoint.
        if (response.status === 404) {
          logger.warn('Got 404, refreshing queryIds and retrying');
          await this.refreshQueryIds();
          queryId = await this.getQueryId('CreateTweet');
          urlWithOperation = `${TWITTER_API_BASE}/${queryId}/CreateTweet`;
          body = buildBody();

          response = await this.fetchWithTimeout(urlWithOperation, {
            method: 'POST',
            headers: { ...this.getHeaders(), referer: 'https://x.com/compose/post' },
            body,
          });

          if (response.status === 404) {
            const retry = await this.fetchWithTimeout(TWITTER_GRAPHQL_POST_URL, {
              method: 'POST',
              headers: { ...this.getHeaders(), referer: 'https://x.com/compose/post' },
              body,
            });

            if (!retry.ok) {
              const text = await retry.text();
              return { success: false, error: `HTTP ${retry.status}: ${text.slice(0, 200)}` };
            }

            const data = (await retry.json()) as CreateTweetResponse;

            if (data.errors && data.errors.length > 0) {
              const fallback = await this.tryStatusUpdateFallback(data.errors, variables);
              if (fallback) {
                return fallback;
              }
              return { success: false, error: this.formatErrors(data.errors) };
            }

            const tweetId = this.extractTweetIdFromResponse(data);
            if (tweetId) {
              return { success: true, tweetId };
            }

            // Verify by fetching recent tweets
            const tweetText = typeof variables.tweet_text === 'string' ? variables.tweet_text : null;
            if (tweetText) {
              const verifiedId = await this.verifyTweetByFetching(tweetText);
              if (verifiedId) {
                return { success: true, tweetId: verifiedId };
              }
            }

            return { success: false, error: 'Tweet not found after posting - may have been filtered or failed silently' };
          }
        }

        if (!response.ok) {
          const text = await response.text();
          return {
            success: false,
            error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
          };
        }

        const data = (await response.json()) as CreateTweetResponse;

        if (data.errors && data.errors.length > 0) {
          const errorCodes = data.errors.map((e) => e.code).filter(Boolean);
          logger.warn('GraphQL returned errors', { errors: data.errors, errorCodes });
          const fallback = await this.tryStatusUpdateFallback(data.errors, variables);
          if (fallback) {
            logger.info('Fallback result', { success: fallback.success, error: fallback.success ? undefined : fallback.error });
            return fallback;
          }
          const formattedError = this.formatErrors(data.errors);
          logger.error('Tweet failed (no fallback)', { error: formattedError });
          return {
            success: false,
            error: formattedError,
          };
        }

        const tweetId = this.extractTweetIdFromResponse(data);
        if (tweetId) {
          logger.info('Tweet success', { tweetId });
          return {
            success: true,
            tweetId,
          };
        }

        // Tweet may have been created but ID not in expected location.
        // Verify by fetching recent tweets from the user's timeline.
        const tweetText = typeof variables.tweet_text === 'string' ? variables.tweet_text : null;
        if (tweetText) {
          const verifiedId = await this.verifyTweetByFetching(tweetText);
          if (verifiedId) {
            return { success: true, tweetId: verifiedId };
          }
        }

        return {
          success: false,
          error: 'Tweet not found after posting - may have been filtered or failed silently',
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    private formatErrors(errors: Array<{ message: string; code?: number }>): string {
      return errors
        .map((error) => (typeof error.code === 'number' ? `${error.message} (${error.code})` : error.message))
        .join(', ');
    }

    private statusUpdateInputFromCreateTweetVariables(variables: Record<string, unknown>): {
      text: string;
      inReplyToTweetId?: string;
      mediaIds?: string[];
    } | null {
      const text = typeof variables.tweet_text === 'string' ? variables.tweet_text : null;
      if (!text) {
        return null;
      }

      const reply = variables.reply;
      const inReplyToTweetId =
        reply &&
        typeof reply === 'object' &&
        typeof (reply as { in_reply_to_tweet_id?: unknown }).in_reply_to_tweet_id === 'string'
          ? (reply as { in_reply_to_tweet_id: string }).in_reply_to_tweet_id
          : undefined;

      const media = variables.media;
      const mediaEntities =
        media && typeof media === 'object' ? (media as { media_entities?: unknown }).media_entities : undefined;

      const mediaIds = Array.isArray(mediaEntities)
        ? mediaEntities
            .map((entity) =>
              entity && typeof entity === 'object' && 'media_id' in (entity as Record<string, unknown>)
                ? (entity as { media_id?: unknown }).media_id
                : undefined,
            )
            .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
            .map((value) => String(value))
        : undefined;

      return { text, inReplyToTweetId, mediaIds: mediaIds && mediaIds.length > 0 ? mediaIds : undefined };
    }

    private async postStatusUpdate(input: {
      text: string;
      inReplyToTweetId?: string;
      mediaIds?: string[];
    }): Promise<TweetResult> {
      const params = new URLSearchParams();
      params.set('status', input.text);
      if (input.inReplyToTweetId) {
        params.set('in_reply_to_status_id', input.inReplyToTweetId);
        params.set('auto_populate_reply_metadata', 'true');
      }
      if (input.mediaIds && input.mediaIds.length > 0) {
        params.set('media_ids', input.mediaIds.join(','));
      }

      try {
        const response = await this.fetchWithTimeout(TWITTER_STATUS_UPDATE_URL, {
          method: 'POST',
          headers: {
            ...this.getBaseHeaders(),
            'content-type': 'application/x-www-form-urlencoded',
            referer: 'https://x.com/compose/post',
          },
          body: params.toString(),
        });

        if (!response.ok) {
          const text = await response.text();
          return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
        }

        const data = (await response.json()) as {
          id_str?: string;
          id?: string | number;
          errors?: Array<{ message: string; code?: number }>;
        };

        if (data.errors && data.errors.length > 0) {
          return { success: false, error: this.formatErrors(data.errors) };
        }

        const tweetId =
          typeof data.id_str === 'string' ? data.id_str : data.id !== undefined ? String(data.id) : undefined;

        if (tweetId) {
          return { success: true, tweetId };
        }
        return { success: false, error: 'Tweet not found after posting - may have been filtered or failed silently' };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    private async tryStatusUpdateFallback(
      errors: Array<{ message: string; code?: number }>,
      variables: Record<string, unknown>,
    ): Promise<TweetResult | null> {
      if (!errors.some((error) => error.code === 226)) {
        logger.debug('No 226 error, skipping fallback');
        return null;
      }
      logger.warn('Error 226 detected, attempting statuses/update fallback');
      const input = this.statusUpdateInputFromCreateTweetVariables(variables);
      if (!input) {
        logger.error('Could not convert variables for fallback');
        return null;
      }

      const fallback = await this.postStatusUpdate(input);
      if (fallback.success) {
        logger.info('Fallback to statuses/update succeeded', { tweetId: fallback.tweetId });
        return fallback;
      }

      logger.error('Fallback to statuses/update also failed', { error: fallback.error });
      return {
        success: false,
        error: `${this.formatErrors(errors)} | fallback: ${fallback.error ?? 'Unknown error'}`,
      };
    }

    /**
     * Extract tweet ID from CreateTweet response, checking multiple possible locations.
     * Twitter's response format can vary, so we check several paths.
     */
    private extractTweetIdFromResponse(data: CreateTweetResponse): string | undefined {
      // Primary location
      const primary = data.data?.create_tweet?.tweet_results?.result?.rest_id;
      if (primary) return primary;

      // Alternative: sometimes nested under 'tweet'
      const result = data.data?.create_tweet?.tweet_results?.result as GraphqlTweetResult | undefined;
      if (result?.tweet?.rest_id) return result.tweet.rest_id;

      // Alternative: legacy format
      const legacy = result?.legacy as { id_str?: string } | undefined;
      if (legacy?.id_str) return legacy.id_str;

      return undefined;
    }

    /**
     * Verify a tweet was posted by fetching recent tweets and matching by text.
     * This is a fallback for when Twitter's response doesn't include the tweet ID.
     *
     * @param expectedText - The text content we expect to find
     * @returns The tweet ID if found, undefined otherwise
     */
    private async verifyTweetByFetching(expectedText: string): Promise<string | undefined> {
      if (!this.clientUserId) {
        return undefined;
      }

      try {
        // Delay to allow Twitter's eventual consistency.
        // Twitter's timeline can take 1-3 seconds to reflect new tweets.
        await this.sleep(1500);

        const features = buildUserTweetsFeatures();
        const variables = {
          userId: this.clientUserId,
          count: 5, // Only fetch last 5 tweets
          includePromotedContent: false,
          withQuickPromoteEligibilityTweetFields: true,
          withVoice: true,
        };

        const fieldToggles = { withArticlePlainText: false };

        const params = new URLSearchParams({
          variables: JSON.stringify(variables),
          features: JSON.stringify(features),
          fieldToggles: JSON.stringify(fieldToggles),
        });

        const queryId = await this.getQueryId('UserTweets');
        const url = `${TWITTER_API_BASE}/${queryId}/UserTweets?${params.toString()}`;

        const response = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.getHeaders(),
        });

        if (!response.ok) {
          return undefined;
        }

        const data = (await response.json()) as {
          data?: {
            user?: {
              result?: {
                timeline?: {
                  timeline?: {
                    instructions?: Array<{
                      entries?: Array<{
                        content?: {
                          itemContent?: {
                            tweet_results?: {
                              result?: GraphqlTweetResult;
                            };
                          };
                        };
                      }>;
                    }>;
                  };
                };
              };
            };
          };
        };

        const instructions = data.data?.user?.result?.timeline?.timeline?.instructions;
        const tweets = parseTweetsFromInstructions(instructions, { quoteDepth: 0, includeRaw: false });

        // Normalize text for comparison (Twitter adds t.co links)
        const normalizeText = (text: string) =>
          text.replace(/https?:\/\/t\.co\/\w+/g, '').trim().toLowerCase();

        const normalizedExpected = normalizeText(expectedText);

        // Find a matching tweet posted within the last minute
        const now = Date.now();
        const oneMinuteAgo = now - 60_000;

        const findMatch = (tweetList: typeof tweets) => {
          for (const tweet of tweetList) {
            const tweetTime = tweet.createdAt ? new Date(tweet.createdAt).getTime() : 0;
            if (tweetTime < oneMinuteAgo) continue;

            const normalizedTweet = normalizeText(tweet.text);

            // Check if the tweet text starts with our expected text (Twitter may append media URLs)
            if (normalizedTweet.startsWith(normalizedExpected) || normalizedExpected.startsWith(normalizedTweet)) {
              return tweet.id;
            }
          }
          return undefined;
        };

        // First attempt
        const firstMatch = findMatch(tweets);
        if (firstMatch) return firstMatch;

        // If not found, wait a bit more and retry (Twitter's eventual consistency)
        await this.sleep(1500);
        const retryResponse = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.getHeaders(),
        });
        if (retryResponse.ok) {
          const retryData = (await retryResponse.json()) as typeof data;
          const retryInstructions = retryData.data?.user?.result?.timeline?.timeline?.instructions;
          const retryTweets = parseTweetsFromInstructions(retryInstructions, { quoteDepth: 0, includeRaw: false });
          const retryMatch = findMatch(retryTweets);
          if (retryMatch) return retryMatch;
        }

        return undefined;
      } catch {
        return undefined;
      }
    }
  }

  return TwitterClientPosting;
}
