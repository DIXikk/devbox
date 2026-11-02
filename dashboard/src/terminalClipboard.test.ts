import { expect, test } from "bun:test";
import { decodeOsc52, isUserInitiated, MAX_OSC52_BASE64, preview, USER_GESTURE_MS } from "./terminalClipboard";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

test("decodeOsc52: clipboard and primary selections, UTF-8 text", () => {
  expect(decodeOsc52(`c;${b64("hello")}`)).toBe("hello");
  expect(decodeOsc52(`;${b64("no selection param")}`)).toBe("no selection param");
  expect(decodeOsc52(`p;${b64("příliš žluťoučký kůň")}`)).toBe("příliš žluťoučký kůň");
  expect(decodeOsc52(`c;${b64("https://claude.ai/oauth/authorize?code=true&state=x")}`)).toBe("https://claude.ai/oauth/authorize?code=true&state=x");
});

test("decodeOsc52: queries are never answered, clears and garbage are ignored", () => {
  expect(decodeOsc52("c;?")).toBeNull();          // read request — must not leak the clipboard
  expect(decodeOsc52("c;")).toBeNull();           // clear
  expect(decodeOsc52("no-semicolon")).toBeNull();
  expect(decodeOsc52("c;not base64!")).toBeNull();
  expect(decodeOsc52(`c;${Buffer.from([0xff, 0xfe]).toString("base64")}`)).toBeNull();   // invalid UTF-8
  expect(decodeOsc52(`c;${"A".repeat(MAX_OSC52_BASE64 + 4)}`)).toBeNull();
});

test("isUserInitiated: only shortly after a gesture", () => {
  expect(isUserInitiated(1000, 1500)).toBe(true);
  expect(isUserInitiated(1000, 1000 + USER_GESTURE_MS)).toBe(true);
  expect(isUserInitiated(1000, 1001 + USER_GESTURE_MS)).toBe(false);
  expect(isUserInitiated(0, 500)).toBe(false);      // no gesture yet
  expect(isUserInitiated(2000, 1000)).toBe(false);  // clock went backwards
});

test("preview: one line, truncated", () => {
  expect(preview("a\n  b\tc")).toBe("a b c");
  expect(preview("x".repeat(100), 10)).toBe("xxxxxxxxx…");
});
