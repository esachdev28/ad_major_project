export async function checkWebXRSupport(isSecureContext, xrSystem) {
  if (!isSecureContext) return 'insecure';
  if (!xrSystem || typeof xrSystem.isSessionSupported !== 'function') return 'unsupported';

  try {
    return (await xrSystem.isSessionSupported('immersive-vr')) ? 'supported' : 'unsupported';
  } catch (_) {
    return 'unsupported';
  }
}
