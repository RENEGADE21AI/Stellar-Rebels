import { isArcadeStage } from './commerce.mjs';

const maxProfileBytes = 512 * 1024;
const maxReplayBytes = 4_000_000;
const operationsWithoutData = new Set([
  'commerce-status', 'commerce-purchase', 'commerce-restore', 'load', 'rating-status', 'rate-app'
]);
const ratingLinks = {
  ios: ['https://apps.apple.com/app/id6837596687?action=write-review'],
  android: [
    'market://details?id=com.renegade21ai.stellarrebels&showAllReviews=true',
    'https://play.google.com/store/apps/details?id=com.renegade21ai.stellarrebels&showAllReviews=true'
  ]
};

export function storeRatingAvailable(platform, flags) {
  return Object.hasOwn(ratingLinks, platform) && flags?.[platform] === true;
}

export async function openStoreRating(platform, { available, isForeground, openURL }) {
  if (!available || !Object.hasOwn(ratingLinks, platform)) return { result: 'unavailable' };
  for (const url of ratingLinks[platform]) {
    if (!isForeground()) return { result: 'unavailable' };
    try {
      await openURL(url);
      return { result: 'opened' };
    } catch {
      // Android can use the HTTPS listing if the Play Store app is absent.
    }
  }
  return { result: 'failed' };
}

export function sameFlightDocument(url, expected) {
  if (typeof url !== 'string' || !url.startsWith('file:///') || !expected) return false;
  const sandboxPath = (uri) => uri.replace(/^file:\/\/\/private\/var\//, 'file:///var/');
  return sandboxPath(url) === sandboxPath(expected);
}

export function readBridgeRequest(event, flightUrl, session, platform) {
  if (!session || typeof event.data !== 'string' || event.data.length > maxReplayBytes) return null;
  // The installed Android WebView reports an opaque origin for packaged file
  // pages. Those messages must still carry the matched page's injected token.
  if (!sameFlightDocument(event.url, flightUrl) && !(platform === 'android' && event.url === 'null')) return null;
  let request;
  try { request = JSON.parse(event.data); } catch { return null; }
  if (!Number.isSafeInteger(request?.id) || request.id < 1 || typeof request.client !== 'string' ||
      !/^[a-f0-9]{32}$/.test(request.client) || request.session !== session ||
      !sameFlightDocument(request.documentUrl, flightUrl)) return null;

  if (operationsWithoutData.has(request.op)) return request.data === undefined ? request : null;
  switch (request.op) {
    case 'authorize-stage': return isArcadeStage(request.data) ? request : null;
    case 'save': return event.data.length <= maxProfileBytes && Number.isSafeInteger(request.data?.schema) ? request : null;
    case 'haptic': return typeof request.data === 'string' ? request : null;
    default: return null;
  }
}
