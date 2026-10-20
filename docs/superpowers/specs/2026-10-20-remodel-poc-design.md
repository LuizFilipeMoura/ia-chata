# Diesel tank-walker remodeling POC

Approved in chat on 2026-10-20. Build two coherent art tracks in the existing procedural Three.js client.

- Remodel Black and Tyrian: squat load-bearing chassis, broad feet, layered armor, articulated mechanical joints, engine/cooling/fuel assemblies, detailed weapon mounts, connected machinery and uneven diesel idle motion.
- Live review refinement: avoid stacked-box torsos. Black gets sloped/chamfered tank armor; Tyrian gets a distinct old-truck cab and bonnet on an exposed frame. Black's shield must clear the body through its action sweep. Idle should visibly shudder like an old diesel engine, with exhaust smoke in normal play as well as the POC.
- Preserve and refine all five skins on both chassis. Separate cosmetic history from game damage. Attach stowage plausibly; concentrate wear around joints, edges, seams and exhaust. Ace uses paint/trim rather than reflective polish.
- Remodel pumphouse with connected crank/rod/beam animation; brick ruins, drums, sandbags, scrap, localized ground dressing, and refinery objective. Preserve measured terrain footprints and objective signals.
- Supply one dedicated POC gallery with coherent industrial scene, both chassis/all skins, legacy comparison, state/action controls, theme previews and runtime cost readout.
- Keep shader roughness floor 0.7, local-light cap 4, existing controlled bloom. No reflective-metal dependency, exposure increase or global guard removal. Gentle diffuse fill only.
- Validate in Foundry Dusk, Rail Yard and Refinery Night at multiple angles and distances; record screenshots and animation evidence, cost comparison, tests and build.
- Only `client3d/src/**` UI. No game rules, weapon identity or base footprint changes. Existing unrelated modifications remain untouched. Main checkout only, one final commit.

The remaining roster and environment catalog are outside this POC. Existing builders may remain as explicit development comparison references; no migration or compatibility layers.
