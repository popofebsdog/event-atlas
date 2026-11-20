import { spawn } from "node:child_process";
const env = {
  ...process.env,
  NODE_ENV: "development",
  LOCAL_DEV: "true",
  ADMIN_TOKEN:
    process.env.ADMIN_TOKEN || "local-development-only-not-for-production",
};
const jobs = [
  spawn(process.execPath, ["--watch", "server/node.js"], {
    stdio: "inherit",
    env,
  }),
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", env },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const job of jobs) if (!job.killed) job.kill("SIGTERM");
  process.exitCode = code;
}
for (const job of jobs) {
  job.on("error", () => stop(1));
  job.on("exit", (code) => stop(code || 0));
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop());
