import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable, PassThrough } from "node:stream";
import { isIP } from "node:net";
import { mock } from "node:test";
import {
  inspectMedia,
  pdfResponse,
  MediaError,
} from "../server/remote-media.js";
import app from "../server/app.js";

import * as transport from "../server/public-fetch.js";
const publicV4 = "93.184.215.14",
  publicV6 = "2606:4700:4700::1111";
const resolved = (address) => ({ address, family: isIP(address) });
function fakeRequest(replies = [{}]) {
  const calls = [];
  function request(options, receive) {
    const req = new EventEmitter();
    calls.push({ options, request: req });
    req.end = () =>
      queueMicrotask(() => {
        const reply = replies[calls.length - 1] || {},
          response =
            reply.stream ||
            Readable.from(
              (reply.body === undefined ? ["%PDF-1.7"] : reply.body).map(
                (chunk) => Buffer.from(chunk),
              ),
            );
        response.statusCode = reply.status || 200;
        response.statusMessage = "OK";
        response.rawHeaders = Object.entries(
          reply.headers || { "Content-Type": "application/pdf" },
        ).flat();
        calls.at(-1).response = response;
        receive(response);
      });
    req.destroy = (error) => {
      if (error) queueMicrotask(() => req.emit("error", error));
    };
    return req;
  }
  return { request, calls };
}
function client(addresses, replies) {
  assert.equal(typeof transport.createPublicFetch, "function");
  const fake = fakeRequest(replies),
    lookups = [];
  const fetch = transport.createPublicFetch({
    lookup: async (host, options) => {
      lookups.push({ host, options });
      return addresses.map(resolved);
    },
    request: fake.request,
  });
  return { fetch, lookups, ...fake };
}

test("Node public fetch rejects loopback, private, link-local, multicast, reserved and mapped addresses before opening sockets", async () => {
  for (const address of [
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "100.64.0.1",
    "100.127.255.254",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.254",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.0.1",
    "198.18.0.1",
    "198.19.255.254",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "239.255.255.255",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "64:ff9b:1::1",
    "100::1",
    "2001::1",
    "2001:2::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3fff::1",
    "fc00::1",
    "fd12::1",
    "fe80::1",
    "ff02::1",
  ]) {
    const { fetch, calls } = client([address]);
    await assert.rejects(
      fetch("https://public.example/file.pdf"),
      (error) => error instanceof MediaError && error.status === 400,
      address,
    );
    assert.equal(calls.length, 0, address);
  }
});

test("Node public fetch rejects ambiguous mixed public/private DNS answers and empty or malformed answers", async () => {
  for (const addresses of [
    [publicV4, "127.0.0.1"],
    [publicV4, "fc00::1"],
    [publicV6, "192.168.0.1"],
    [],
    ["invalid"],
  ]) {
    const { fetch, calls } = client(addresses);
    await assert.rejects(fetch("https://public.example/file.pdf"), /公開|DNS/);
    assert.equal(calls.length, 0);
  }
});

test("public HTTPS fetch pins a verified address, retains TLS and HTTP host names, and forwards only document headers", async () => {
  const { fetch, calls, lookups } = client(
    [publicV6, publicV4],
    [
      {
        status: 206,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Range": "bytes 0-7/2000",
          "Content-Length": "8",
        },
        body: ["%PDF-1.7"],
      },
    ],
  );
  const signal = AbortSignal.timeout(5000);
  const response = await fetch(
    "https://reports.example/document.pdf?version=2",
    {
      method: "GET",
      signal,
      headers: {
        Range: "bytes=0-7",
        Host: "localhost",
        Authorization: "secret",
        Cookie: "private",
        "Accept-Encoding": "gzip",
      },
    },
  );
  const options = calls[0].options;
  assert.equal(lookups.length, 1);
  assert.equal(lookups[0].host, "reports.example");
  assert.equal(lookups[0].options.all, true);
  assert.equal(options.hostname, "reports.example");
  assert.equal(options.servername, "reports.example");
  assert.equal(options.headers.host, "reports.example");
  assert.equal(options.path, "/document.pdf?version=2");
  assert.equal(options.port, 443);
  assert.equal(options.agent, false);
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.autoSelectFamily, false);
  assert.equal(options.signal, signal);
  assert.equal(options.headers.range, "bytes=0-7");
  assert.equal(options.headers["accept-encoding"], "identity");
  assert.equal(options.headers.authorization, undefined);
  assert.equal(options.headers.cookie, undefined);
  await new Promise((resolve, reject) =>
    options.lookup("reports.example", {}, (error, address, family) => {
      if (error) return reject(error);
      assert.equal(address, publicV4);
      assert.equal(family, 4);
      resolve();
    }),
  );
  await new Promise((resolve, reject) =>
    options.lookup("reports.example", { all: true }, (error, addresses) => {
      if (error) return reject(error);
      assert.deepEqual(addresses, [resolved(publicV4)]);
      resolve();
    }),
  );
  assert.equal(
    lookups.length,
    1,
    "the connection lookup must not resolve the host again",
  );
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 0-7/2000");
  assert.equal(await response.text(), "%PDF-1.7");
});

test("public IPv6 DNS answers stay pinned and HEAD responses have no body", async () => {
  const { fetch, calls } = client([publicV6]);
  const response = await fetch("https://reports.example/file.pdf", {
    method: "HEAD",
  });
  assert.equal(calls[0].options.method, "HEAD");
  assert.equal(calls[0].options.family, 6);
  await new Promise((resolve, reject) =>
    calls[0].options.lookup("reports.example", {}, (error, address, family) => {
      if (error) return reject(error);
      assert.equal(address, publicV6);
      assert.equal(family, 6);
      resolve();
    }),
  );
  assert.equal(response.body, null);
});

test("URL restrictions and non-read methods are rejected before DNS, including alternate loopback spellings", async () => {
  for (const url of [
    "http://reports.example/file.pdf",
    "https://user:password@reports.example/file.pdf",
    "https://reports.example:8443/file.pdf",
    "https://localhost/file.pdf",
    "https://localhost./file.pdf",
    "https://service.local/file.pdf",
    "https://127.1/file.pdf",
    "https://2130706433/file.pdf",
    "https://0x7f000001/file.pdf",
    "https://[::1]/file.pdf",
  ]) {
    const { fetch, calls, lookups } = client([publicV4]);
    await assert.rejects(fetch(url));
    assert.equal(calls.length, 0);
    assert.equal(lookups.length, 0);
  }
  const { fetch } = client([publicV4]);
  await assert.rejects(
    fetch("https://reports.example/file.pdf", { method: "POST" }),
    /GET|HEAD|讀取/,
  );
});

test("abort stops both preflight and an unfinished DNS lookup before a socket can open", async () => {
  const initial = client([publicV4]),
    aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    initial.fetch("https://reports.example/file.pdf", {
      signal: aborted.signal,
    }),
    { name: "AbortError" },
  );
  assert.equal(initial.lookups.length, 0);
  assert.equal(initial.calls.length, 0);
  let resolveDns;
  const fake = fakeRequest(),
    controller = new AbortController();
  const fetch = transport.createPublicFetch({
    lookup: () =>
      new Promise((resolve) => {
        resolveDns = resolve;
      }),
    request: fake.request,
  });
  const pending = fetch("https://reports.example/file.pdf", {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  resolveDns([resolved(publicV4)]);
  assert.equal(fake.calls.length, 0);
});

test("document response streams reach the caller before completion and cancellation closes the source", async () => {
  const source = new PassThrough(),
    { fetch, calls } = client([publicV4], [{ stream: source }]);
  const response = await fetch("https://reports.example/file.pdf"),
    reader = response.body.getReader();
  source.write("%PDF-1.7");
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), "%PDF-1.7");
  assert.equal(first.done, false);
  await reader.cancel();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls[0].response.destroyed, true);
});

test("each redirect is resolved again and a public-to-private redirect never opens the second socket", async () => {
  assert.equal(typeof transport.createPublicFetch, "function");
  const fake = fakeRequest([
      {
        status: 302,
        headers: { Location: "https://private.example/file.pdf" },
      },
    ]),
    hosts = [];
  const fetch = transport.createPublicFetch({
    lookup: async (host) => {
      hosts.push(host);
      return [resolved(host === "public.example" ? publicV4 : "10.0.0.1")];
    },
    request: fake.request,
  });
  await assert.rejects(
    inspectMedia("https://public.example/file.pdf", "atlas.example", fetch),
    /公開/,
  );
  assert.deepEqual(hosts, ["public.example", "private.example"]);
  assert.equal(fake.calls.length, 1);
});

test("the shared API uses the injected safe transport for both PDF reads and MIME inspection", async () => {
  const { fetch, calls } = client(["127.0.0.1"]);
  const env = {
    PUBLIC_FETCH: fetch,
    DB: {
      prepare() {
        return {
          bind() {
            return this;
          },
          async first() {
            return { url: "https://reports.example/file.pdf" };
          },
        };
      },
    },
  };
  for (const endpoint of ["media", "pdf"]) {
    const response = await app.fetch(
      new Request(`https://atlas.example/api/events/example/${endpoint}`),
      env,
    );
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /公開/);
  }
  assert.equal(calls.length, 0);
});

test("encoded PDF transfers are rejected and cancelled before forwarding misleading byte range or length headers", async () => {
  for (const encoding of ["gzip", "br", "deflate", "gzip, br"]) {
    let cancelled = false;
    const source = new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      {
        status: 206,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Encoding": encoding,
          "Content-Length": "20",
          "Content-Range": "bytes 0-19/2000",
        },
      },
    );
    await assert.rejects(
      pdfResponse(
        "https://reports.example/file.pdf",
        new Request("https://atlas.example/api/events/example/pdf"),
        {},
        async () => source,
      ),
      (error) => error instanceof MediaError && error.status === 502,
    );
    assert.equal(cancelled, true);
  }
});

test("Cloudflare default fetch keeps the same encoded-PDF guard without importing Node transport", async () => {
  const remote = mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("compressed bytes", {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Encoding": "gzip",
          "Content-Length": "16",
        },
      }),
  );
  const env = {
    DB: {
      prepare() {
        return {
          bind() {
            return this;
          },
          async first() {
            return { url: "https://reports.example/file.pdf" };
          },
        };
      },
    },
  };
  try {
    const response = await app.fetch(
      new Request("https://atlas.example/api/events/example/pdf"),
      env,
    );
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("content-length"), null);
    assert.match((await response.json()).error, /壓縮/);
  } finally {
    remote.mock.restore();
  }
});
