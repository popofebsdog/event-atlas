import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

// Runs locally only. There is deliberately no public URL-fetch proxy.
const prompt = createInterface({ input: stdin, output: stdout });
let value = process.argv[2];
if (!value)
  value = await prompt.question("請貼上要備份的公開 HTTPS 網頁網址：");
prompt.close();
let url;
try {
  url = new URL(value);
} catch {
  console.error("網址無效");
  process.exit(1);
}
if (url.protocol !== "https:" || url.username || url.password) {
  console.error("只接受不含帳密的 HTTPS 網址");
  process.exit(1);
}
const root = resolve("archives");
await mkdir(root, { recursive: true });
const folder = await mkdtemp(join(root, "page-"));
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code));
  });
}
try {
  console.log(
    "正在保存公開 HTML 與頁面所需資源（最長 3 分鐘）。部分動態內容可能需要連線。",
  );
  const code = await run(
    "wget",
    [
      "--page-requisites",
      "--convert-links",
      "--adjust-extension",
      "--span-hosts",
      "--no-parent",
      "--timeout=15",
      "--tries=1",
      "--max-redirect=5",
      "--limit-rate=2m",
      "--directory-prefix",
      folder,
      "--",
      url.href,
    ],
    { timeout: 180000 },
  );
  await writeFile(
    join(folder, "ARCHIVE-INFO.txt"),
    `來源：${url.href}\n保存時間：${new Date().toISOString()}\nwget 結束碼：${code}\n這是公開網頁資源的盡力備份，不是原始開發專案。動態 API、跨域資源、影片、地圖磚不保證離線可用。\n`,
    "utf8",
  );
  const zip = `${folder}.zip`;
  const result = await run("zip", ["-qr", zip, "."], { cwd: folder });
  if (result !== 0) throw new Error("ZIP 打包失敗");
  console.log(
    `${code === 0 ? "已完成" : "部分資源可能未下載，請檢查"}：${zip}`,
  );
} catch (e) {
  console.error(
    `下載未完成：${e.message}。需先安裝 wget 與 zip。已下載資料保留於 ${folder}`,
  );
  process.exitCode = 1;
}
