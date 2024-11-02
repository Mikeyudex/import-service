import { BullModuleOptions, SharedBullConfigurationFactory } from '@nestjs/bull';

export class RedisConfig implements SharedBullConfigurationFactory {
  createSharedConfiguration(): BullModuleOptions {
    return {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: +process.env.REDIS_PORT || 6379,
      },
    };
  }
}
