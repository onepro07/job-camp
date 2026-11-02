import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'
import { publicConfig } from './config'

export const cloud = createWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
  publishableKey: publicConfig.publishableKey,
})
