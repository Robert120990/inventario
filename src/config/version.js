import versionData from './version.json';

export const APP_VERSION_DATA = versionData;
export const APP_DISPLAY_VERSION = versionData.displayVersion || `v${versionData.version}`;
export const APP_SHORT_VERSION = versionData.shortDisplay || 'v1.3';
export const APP_BUILD_NUMBER = versionData.build || 86;
export const APP_COMMIT_HASH = versionData.commit || 'local';

export default versionData;
