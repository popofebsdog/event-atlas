import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";
import { MediaError } from "./remote-media.js";

// Conservative exclusions from IANA's special-purpose registries, including transition networks.
const privateV4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
])
  privateV4.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList(),
  specialV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
])
  specialV6.addSubnet(address, prefix, "ipv6");
function publicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !privateV4.check(address, "ipv4");
  return (
    family === 6 &&
    !address.includes("%") &&
    globalV6.check(address, "ipv6") &&
    !specialV6.check(address, "ipv6")
  );
}
function publicURL(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new MediaError("僅能預覽公開 HTTPS 網址");
  }
  const hostname = url.hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    hostname === "localhost" ||
    /\.(localhost|local|internal)$/.test(hostname) ||
    (!isIP(hostname) && !hostname.includes(".")) ||
    (isIP(hostname) && !publicAddress(hostname))
  )
    throw new MediaError("僅能預覽公開 HTTPS 網址");
  url.hash = "";
  return { url, hostname };
}
function abortable(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

// Only Node injects this transport. Cloudflare keeps its native fetch and network isolation.
export function createPublicFetch({
  lookup = dnsLookup,
  request = httpsRequest,
} = {}) {
  return async function publicFetch(value, init = {}) {
    const { url, hostname } = publicURL(value),
      method = (init.method || "GET").toUpperCase();
    if (!["GET", "HEAD"].includes(method) || init.body != null)
      throw new MediaError("公開檔案僅支援 GET／HEAD 讀取");
    const signal = init.signal || AbortSignal.timeout(12000);
    signal.throwIfAborted();
    const literal = isIP(hostname);
    const addresses = literal
      ? [{ address: hostname, family: literal }]
      : await abortable(
          lookup(hostname, { all: true, verbatim: true }),
          signal,
        );
    if (
      !addresses.length ||
      addresses.some(
        (item) =>
          !publicAddress(item.address) || isIP(item.address) !== item.family,
      )
    )
      throw new MediaError(
        "DNS 回傳非公開或無效的 IP，僅能預覽公開 HTTPS 網址",
      );
    // Prefer IPv4 on dual-stack hosts; never retry with an unchecked DNS answer or reused socket.
    const selected =
      addresses.find((item) => item.family === 4) || addresses[0];
    signal.throwIfAborted();
    const input = new Headers(init.headers),
      headers = { host: url.host, "accept-encoding": "identity" };
    for (const name of ["accept", "range"])
      if (input.has(name)) headers[name] = input.get(name);
    return new Promise((resolve, reject) => {
      const options = {
        protocol: "https:",
        hostname,
        port: 443,
        path: url.pathname + url.search,
        method,
        headers,
        signal,
        agent: false,
        rejectUnauthorized: true,
        servername: literal ? undefined : hostname,
        family: selected.family,
        autoSelectFamily: false,
        lookup(_host, options, callback) {
          if (options?.all) callback(null, [{ ...selected }]);
          else callback(null, selected.address, selected.family);
        },
      };
      const pending = request(options, (incoming) => {
        try {
          const headers = new Headers();
          for (let i = 0; i < incoming.rawHeaders.length; i += 2)
            headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
          const noBody =
            method === "HEAD" || [204, 205, 304].includes(incoming.statusCode);
          if (noBody) {
            incoming.on("error", () => {});
            incoming.resume();
          }
          const body = noBody
            ? null
            : Readable.toWeb(incoming, {
                strategy: {
                  highWaterMark: 64 * 1024,
                  size: (chunk) => chunk.byteLength,
                },
              });
          resolve(
            new Response(body, {
              status: incoming.statusCode,
              statusText: incoming.statusMessage,
              headers,
            }),
          );
        } catch (error) {
          incoming.destroy();
          reject(error);
        }
      });
      pending.once("error", reject);
      pending.once("upgrade", (_response, socket) => {
        socket.destroy();
        reject(new MediaError("來源回傳不支援的通訊協定", 502));
      });
      pending.end();
    });
  };
}

export const publicFetch = createPublicFetch();
