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

  describe("prerelease versions", () => {
    it("should start alpha from stable (bumps minor)", () => {
      expect(bumpVersion("0.7.0", "alpha")).toBe("0.8.0-a1");
      expect(bumpVersion("1.2.3", "alpha")).toBe("1.3.0-a1");
    });

    it("should increment alpha number", () => {
      expect(bumpVersion("0.7.0-a1", "alpha")).toBe("0.7.0-a2");
      expect(bumpVersion("0.7.0-a9", "alpha")).toBe("0.7.0-a10");
    });

    it("should promote alpha to beta", () => {
      expect(bumpVersion("0.7.0-a2", "beta")).toBe("0.7.0-b1");
    });

    it("should promote beta to rc", () => {
      expect(bumpVersion("0.7.0-b3", "rc")).toBe("0.7.0-rc1");
    });

    it("should graduate prerelease to stable with patch", () => {
      expect(bumpVersion("0.7.0-a1", "patch")).toBe("0.7.0");
      expect(bumpVersion("0.7.0-b2", "patch")).toBe("0.7.0");
      expect(bumpVersion("0.7.0-rc1", "patch")).toBe("0.7.0");
    });

    it("should graduate and bump minor", () => {
      expect(bumpVersion("0.7.0-a1", "minor")).toBe("0.8.0");
    });

    it("should graduate and bump major", () => {
      expect(bumpVersion("0.7.0-a1", "major")).toBe("1.0.0");
    });
  });
});
