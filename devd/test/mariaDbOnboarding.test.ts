import { expect, test } from "bun:test";
import { mariaPrivileges, mariaRoleSql } from "../src/mariaDbOnboarding";
import { MARIA_STORED_OBJECT_PROFILE } from "../src/mariaDbMigrationProfile";
import type { OnboardingPlan } from "../src/dbOnboarding";

const plan = {
  mariaMigrationProfile: MARIA_STORED_OBJECT_PROFILE,
  entry: { name: "fixture", server: "fixture", db: "fixture_%", roUser: "fixture_ro", opItem: "read",
    rwUser: "fixture_rw", rwOpItem: "write", migrationUser: "fixture_migration", migrationOpItem: "migration" },
} as OnboardingPlan;
const objectDdl = ["TRIGGER", "CREATE ROUTINE", "ALTER ROUTINE", "EXECUTE"];

test("MariaDB migration profile supports the trigger and procedure migration lifecycle", () => {
  const privileges = mariaPrivileges(plan, "fixture_migration");
  for (const privilege of objectDdl) expect(privileges).toContain(privilege);
  const sql = mariaRoleSql(plan, "fixture_migration", "synthetic-test-password", "192.0.2.10");
  expect(sql).toContain("GRANT " + privileges.join(", ") + " ON `fixture\\_\\%`.* TO 'fixture_migration'@'192.0.2.10'");
  expect(sql).not.toContain("ON *.*");
  expect(sql).not.toContain("WITH GRANT OPTION");
  expect(sql).not.toContain("ALL PRIVILEGES ON");
});

test("MariaDB read-only and DML profiles do not acquire executable schema objects", () => {
  expect(mariaPrivileges(plan, "fixture_ro")).toEqual(["SELECT"]);
  expect(mariaPrivileges(plan, "fixture_rw")).toEqual(["SELECT", "INSERT", "UPDATE", "DELETE"]);
  for (const role of ["fixture_ro", "fixture_rw"]) {
    for (const privilege of objectDdl) expect(mariaPrivileges(plan, role)).not.toContain(privilege);
  }
});

test("an old approved MariaDB plan retains its original grant profile on resume", () => {
  const legacy = { ...plan, mariaMigrationProfile: undefined };
  for (const privilege of objectDdl) expect(mariaPrivileges(legacy, "fixture_migration")).not.toContain(privilege);
});
