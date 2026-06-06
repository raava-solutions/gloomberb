export const TITLEBAR_TRAFFIC_LIGHT_WIDTH = 8;
export const TITLEBAR_OVERLAY_HEIGHT_PX = 28;

function currentPlatform(): string {
  const globalWithNavigator = globalThis as typeof globalThis & {
    navigator?: {
      platform?: string;
      userAgentData?: { platform?: string };
    };
  };
  return globalWithNavigator.navigator?.userAgentData?.platform
    ?? globalWithNavigator.navigator?.platform
    ?? "";
}

export function getTitlebarLeadingInset(platform = currentPlatform()): number {
  return /mac/i.test(platform) ? TITLEBAR_TRAFFIC_LIGHT_WIDTH : 0;
}
