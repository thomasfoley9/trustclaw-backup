import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guard for the EA ground rule: migrations are additive only. Every EA
// migration (folder name containing "ea_") must never alter or drop existing
// columns or tables. CREATE TABLE / CREATE INDEX / ADD COLUMN / ADD CONSTRAINT
// are the only allowed shapes.
const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

function eaMigrationFolders(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("ea_"));
}

describe("EA migrations", () => {
  it("at least one EA migration exists", () => {
    expect(eaMigrationFolders().length).toBeGreaterThan(0);
  });

  it("EA migrations are additive only", () => {
    for (const folder of eaMigrationFolders()) {
      const sql = readFileSync(
        join(MIGRATIONS_DIR, folder, "migration.sql"),
        "utf8",
      );
      const statements = sql
        .split(";")
        .map((s) => s.replace(/--[^\n]*/g, "").trim())
        .filter(Boolean);

      for (const statement of statements) {
        const upper = statement.toUpperCase();
        expect(upper).not.toMatch(/\bDROP\b/);
        expect(upper).not.toMatch(/ALTER\s+COLUMN/);
        expect(upper).not.toMatch(/\bRENAME\b/);
        expect(upper).not.toMatch(/\bTRUNCATE\b/);
        expect(
          /^(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE)/.test(upper),
        ).toBe(true);
        if (upper.startsWith("ALTER TABLE")) {
          expect(upper).toMatch(/ADD (COLUMN|CONSTRAINT)/);
        }
      }
    }
  });

  it("ea_spine creates the three EA tables with their dedup and ID uniques", () => {
    const sql = readFileSync(
      join(MIGRATIONS_DIR, "20260820200000_ea_spine", "migration.sql"),
      "utf8",
    );
    expect(sql).toContain('CREATE TABLE "composio_claw_ea_task"');
    expect(sql).toContain('CREATE TABLE "composio_claw_ea_watch"');
    expect(sql).toContain('CREATE TABLE "composio_claw_ea_event"');
    expect(sql).toContain(
      '"composio_claw_ea_task_instanceId_shortId_key"',
    );
    expect(sql).toContain(
      '"composio_claw_ea_event_instanceId_fingerprint_key"',
    );
    expect(sql).toContain('ADD COLUMN "eaTaskCounter"');
  });
});
