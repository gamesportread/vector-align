# Rocket Liftoff Mission (Mission 01 · Liftoff) System Architecture Blueprint

This document details the engineering architecture, physics and mathematical models, KSP-style control mappings, 4-stage progressive curriculum, and headless self-test interface specifications for the primary task **"1 Liftoff"** in Vector Align.

## 1. Module Directory Structure

- `src/sim/liftoff/types.ts` — Type definitions for the liftoff physics engine, multi-stage rocket configurations, Keplerian orbital elements, KSP flight commands, and 4-level scenario configurations.
- `src/sim/liftoff/vehicles.ts` — Multi-stage parameter configurations based on NASA AS-506 flight evaluation reports for **Saturn V** and realistic staging configurations.
- `src/sim/liftoff/atmosphere.ts` — US Standard Atmosphere 1976 layered atmospheric model, transonic shock drag coefficient $C_d(M, \alpha)$, and dynamic pressure $q$ computations.
- `src/sim/liftoff/orbit.ts` — Spherical Earth gravity, launch site latitude rotation velocity assistance, and real-time Keplerian orbital elements (Apoapsis $Ap$, Periapsis $Pe$, eccentricity $e$, and First Cosmic Velocity) solver.
- `src/sim/liftoff/scenarios.ts` — Parameter configurations following the "00 Stage Briefing + 4 Progressive Missions" curriculum, alongside the teen-friendly aerospace glossary `LIFTOFF_GLOSSARY`.
- `src/sim/liftoff/engine.ts` — 60 Hz fixed-step variable-mass rocket ascent dynamics integrator `stepLiftoff`, staging state machine `stageRocket`, and deterministic autopilot `liftoffAutopilot`.
- `src/testing/liftoff-driver.ts` — Lightweight headless test driver `liftoffDriver` requiring no WebGL or browser environment.
- `src/sim/liftoff/engine.test.ts` — Automated test suite covering physical invariants, failure modes, and scenario completions across all four levels.
- `src/components/scene/TaskCameraControls.tsx` & `src/components/scene/taskCameraConfig.ts` — Unified mouse camera controller shared across all 3D task scenes (**left-drag rotate, right-drag pan, wheel zoom**). Both `LiftoffScene3D.tsx` and `Scene.tsx` provide consistent 3D viewport interaction through this component; all future 3D mission scenes must directly reuse it rather than reimplementing camera controls.

## 2. Quick Verification Command

```sh
npm run test:api
```
