/**
 * urlValidator.js
 *
 * Security utility for Server-Side Request Forgery (SSRF) prevention.
 * Validates URLs before they are saved to the database or probed by the monitoring engine.
 *
 * Protections:
 * 1. Strict protocol checking: Only http: and https: are permitted.
 * 2. Hostname blocklist: Prohibits localhost, loopback, and cloud metadata hostnames.
 * 3. IP address range filtering: Blocks RFC 1918 private ranges, loopback (127.0.0.0/8),
 *    link-local / AWS/GCP metadata addresses (169.254.0.0/16).
 * 4. DNS Resolution inspection: Resolves domain to IP to prevent DNS rebinding attacks.
 */

const dns = require('dns').promises;
const net = require('net');

// Private IPv4 CIDR blocks and specific reserved ranges
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  'instance-data',
]);

/**
 * Checks if an IPv4 address belongs to a private, loopback, or link-local range.
 *
 * @param {string} ip - IPv4 string (e.g. "192.168.1.1")
 * @returns {boolean} - True if blocked, false if public/safe
 */
function isBlockedIp(ip) {
  // If IPv6 loopback
  if (ip === '::1' || ip === '::' || ip.startsWith('fe80:')) {
    return true;
  }

  // IPv4 check
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true;
  }

  const [p0, p1] = parts;

  // 127.0.0.0/8 (Loopback)
  if (p0 === 127) return true;

  // 0.0.0.0/8 (Current network)
  if (p0 === 0) return true;

  // 10.0.0.0/8 (RFC 1918 Private)
  if (p0 === 10) return true;

  // 172.16.0.0/12 (RFC 1918 Private: 172.16.0.0 – 172.31.255.255)
  if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;

  // 192.168.0.0/16 (RFC 1918 Private)
  if (p0 === 192 && p1 === 168) return true;

  // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
  if (p0 === 169 && p1 === 254) return true;

  // 100.64.0.0/10 (Carrier Grade NAT)
  if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;

  return false;
}

/**
 * Validates a target URL against SSRF and syntax rules.
 *
 * @param {string} rawUrl - Full URL string to validate
 * @returns {Promise<{ isValid: boolean, error?: string, parsedUrl?: URL }>}
 */
async function validateUrlForMonitoring(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'URL must be a non-empty string.' };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (err) {
    return { isValid: false, error: 'Malformed URL format. Must include protocol (http:// or https://).' };
  }

  // 1. Enforce allowed schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isValid: false, error: `Invalid scheme "${parsed.protocol}". Only HTTP and HTTPS are permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Block direct forbidden hostnames
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return {
      isValid: false,
      error: `Access to internal/loopback hostname "${hostname}" is forbidden for security (SSRF protection).`,
    };
  }

  // 3. If hostname is directly an IP address, check against blocked ranges
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      return {
        isValid: false,
        error: `Access to private IP address "${hostname}" is forbidden (SSRF protection).`,
      };
    }
    return { isValid: true, parsedUrl: parsed };
  }

  // 4. Resolve domain name via DNS to check resolved IP (Anti-DNS Rebinding)
  try {
    const lookupResult = await dns.lookup(hostname);
    if (isBlockedIp(lookupResult.address)) {
      return {
        isValid: false,
        error: `Domain "${hostname}" resolves to private IP "${lookupResult.address}", which is blocked (SSRF protection).`,
      };
    }
  } catch (dnsErr) {
    return {
      isValid: false,
      error: `Could not resolve domain name "${hostname}": ${dnsErr.message}`,
    };
  }

  return { isValid: true, parsedUrl: parsed };
}

module.exports = {
  validateUrlForMonitoring,
  isBlockedIp,
};
