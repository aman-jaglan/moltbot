# Marlo Integration TODO

## Phase 1: Foundation ✅ COMPLETE
- [x] Create src/marlo/ directory
- [x] Create types.ts - TypeScript interfaces
- [x] Create constants.ts - API URLs, defaults
- [x] Create config.ts - Config helpers
- [x] Create client.ts - MarloClient HTTP client
- [x] Add marlo section to zod-schema.ts
- [x] Add MarloConfig type to types.clawdbot.ts

## Phase 2: Trajectory Capture ✅ COMPLETE
- [x] Create trajectory.ts - Trajectory state management
- [x] Create capture-hooks.ts - Event capture utilities  
- [x] Create index.ts - Main exports and init/shutdown
- [x] Hook gateway startup for Marlo initialization
- [x] Hook gateway shutdown for cleanup

## Phase 3: Learning Integration ✅ COMPLETE
- [x] Create learnings.ts - Fetch and format learnings (legacy API-based)
- [x] Create learnings-sync.ts - File-based sync to LEARNINGS.md
- [x] Sync learnings at task start (in startMessageCapture)
- [x] LEARNINGS.md loaded via Project Context (no cli-runner changes needed!)
- [ ] Add /learnings command (optional enhancement)

## Phase 4: Onboarding ✅ COMPLETE
- [x] Create onboarding.marlo.ts - Marlo setup module
- [x] Add Marlo step to wizard/onboarding.ts
- [x] Add skipMarlo option to OnboardOptions
- [x] Add API key validation

## Phase 5: Integration ✅ COMPLETE
- [x] Wire capture hooks into dispatch-from-config.ts
- [x] Start capture before message processing (syncs learnings)
- [x] End capture on success/error/abort paths

## Phase 6: Testing ✅ COMPLETE
- [x] Verify TypeScript compiles
- [x] Verify build succeeds
- [x] Verify gateway starts without errors
- [x] Verify Marlo disabled by default works (no config = no errors)
- [x] Verify all module imports work correctly
- [x] All 545 auto-reply tests pass
- [ ] Verify onboarding flow works (manual test)
- [ ] End-to-end trajectory capture test (requires Marlo API key)

## Files Created
- src/marlo/types.ts
- src/marlo/constants.ts
- src/marlo/config.ts
- src/marlo/client.ts
- src/marlo/trajectory.ts
- src/marlo/learnings.ts (legacy prompt-based)
- src/marlo/learnings-sync.ts (file-based sync to LEARNINGS.md)
- src/marlo/capture-hooks.ts
- src/marlo/index.ts
- src/marlo/TODO.md
- src/config/types.marlo.ts
- src/wizard/onboarding.marlo.ts

## Files Modified
- src/config/zod-schema.ts - Added marlo config schema
- src/config/types.ts - Added marlo types export
- src/config/types.clawdbot.ts - Added marlo to MoltbotConfig
- src/commands/onboard-types.ts - Added skipMarlo option
- src/wizard/onboarding.ts - Added Marlo setup step
- src/gateway/server.impl.ts - Added Marlo init/shutdown
- src/auto-reply/reply/dispatch-from-config.ts - Integrated capture hooks

## Supported Models
Currently integrated with:
- OpenAI models (via API)
- Anthropic models (Claude)
- Any model accessible via LiteLLM

The integration captures trajectories regardless of the underlying model provider.
