# Skill Observation Log

Observations captured during task-oriented work. Each entry identifies a potential skill improvement or new skill opportunity.

**Status key:** OPEN = not yet actioned | ACTIONED = skill updated/created | DECLINED = user decided not to pursue

---

## 2026-05-25

### Observation 1: tauri init non-interactive flags pattern

**Date:** 2026-05-25
**Session context:** Phase 0 Tauri scaffold for PIXEL.PAL migration
**Skill:** New skill candidate: superpowers:executing-plans (or Tauri migration pattern)
**Type:** open-source
**Phase/Area:** Tool scaffolding — non-interactive CLI invocation

**Issue:** `npx tauri init` is fully interactive by default and hangs in PowerShell. The `--ci` flag plus explicit flags (`-A`, `-W`, `-D`, `-P`, `--before-dev-command`, `--before-build-command`) enables fully non-interactive scaffolding. Also: generated `tauri.conf.json` uses placeholder identifier `com.tauri.dev` which must be replaced before any build step or it causes rejection.

**Suggested improvement:** Add to Tauri migration skill/plan: always check `--help` before running interactive CLIs, use `--ci` + full flag set for `tauri init`, and immediately patch identifier + version + window dims in `tauri.conf.json` post-init.

**Principle:** Interactive CLI scaffolding commands need non-interactive flags researched before execution, not after hanging. The `--ci` pattern is common across many CLI tools (Jest, Tauri, create-react-app). Always run `--help` first; the full non-interactive invocation is one command once flags are known.
