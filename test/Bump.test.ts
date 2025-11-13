import { describe, expect, it } from "vitest";
import { bumpVersion } from "../src/Bump.ts";

describe("version bumping", () => {
  it("should bump patch version", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(bumpVersion("0.0.0", "patch")).toBe("0.0.1");
  });

  it("should bump minor version", () => {
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(bumpVersion("0.0.5", "minor")).toBe("0.1.0");
  });

  it("should bump major version", () => {
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
    expect(bumpVersion("0.5.8", "major")).toBe("1.0.0");
  });

  it("should throw on invalid version", () => {
    expect(() => bumpVersion("invalid", "patch")).toThrow("Invalid version");
    expect(() => bumpVersion("1.2", "patch")).toThrow("Invalid version");
  });
});
