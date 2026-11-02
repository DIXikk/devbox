import { expect, test } from "bun:test";
import { filesFrom, MAX_UPLOAD_BYTES, promptText, tooLarge, uploadName, uploadToSession } from "./terminalUpload";

const at = new Date(2026, 10, 3, 9, 5, 7);

test("filesFrom: files of a paste/drop, none for plain text or a missing DataTransfer", () => {
  const f = { name: "a.txt" } as File;
  expect(filesFrom({ files: [f] as unknown as ArrayLike<File> })).toEqual([f]);
  expect(filesFrom({ files: [] as unknown as ArrayLike<File> })).toEqual([]);
  expect(filesFrom({ files: null })).toEqual([]);
  expect(filesFrom(null)).toEqual([]);
});

test("uploadName: clipboard screenshots get a timestamped name, real files keep theirs", () => {
  expect(uploadName({ name: "image.png", size: 1, type: "image/png" }, at)).toBe("img-20261103-090507.png");
  expect(uploadName({ name: "image.JPEG", size: 1, type: "image/jpeg" }, at)).toBe("img-20261103-090507.jpeg");
  expect(uploadName({ name: "", size: 1, type: "image/jpeg" }, at)).toBe("img-20261103-090507.jpg");
  expect(uploadName({ name: "", size: 1, type: "" }, at)).toBe("img-20261103-090507.bin");
  expect(uploadName({ name: "report final.pdf", size: 1, type: "application/pdf" }, at)).toBe("report final.pdf");
  expect(uploadName({ name: "image-crop.png", size: 1, type: "image/png" }, at)).toBe("image-crop.png");
});

test("tooLarge: over the 25 MB limit", () => {
  const ok = { name: "a", size: MAX_UPLOAD_BYTES, type: "" };
  const big = { name: "b", size: MAX_UPLOAD_BYTES + 1, type: "" };
  expect(tooLarge([ok, big])).toEqual([big]);
});

test("promptText: space separated with a trailing space, empty for nothing", () => {
  expect(promptText(["/workspace/.inbox/a.png"])).toBe("/workspace/.inbox/a.png ");
  expect(promptText(["/workspace/.inbox/a.png", "/workspace/.inbox/b.txt"])).toBe("/workspace/.inbox/a.png /workspace/.inbox/b.txt ");
  expect(promptText([])).toBe("");
});

test("uploadToSession: raw body, encoded name header, returns the path; surfaces server errors", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const ok = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ path: "/workspace/.inbox/screen_shot.png" }), { status: 200 });
  }) as unknown as typeof fetch;
  const file = new File([new Uint8Array([1, 2])], "screen shot.png");
  expect(await uploadToSession("dev-a b", file, "screen shot.png", ok)).toBe("/workspace/.inbox/screen_shot.png");
  expect(calls[0].url).toBe("/api/sessions/dev-a%20b/upload");
  expect(calls[0].init.method).toBe("POST");
  expect((calls[0].init.headers as Record<string, string>)["x-devbox-filename"]).toBe("screen%20shot.png");
  expect(calls[0].init.body).toBe(file);

  const denied = (async () => new Response(JSON.stringify({ error: "file is too large (max 25 MB)" }), { status: 413 })) as unknown as typeof fetch;
  await expect(uploadToSession("dev-a", file, "x", denied)).rejects.toThrow("file is too large (max 25 MB)");
  const broken = (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch;
  await expect(uploadToSession("dev-a", file, "x", broken)).rejects.toThrow("HTTP 502");
});
