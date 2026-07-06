import type { ReactNode } from "react";
import { RoomProvider } from "./state/RoomStateContext";
import { UiProvider } from "./state/UiStateContext";
import { DrawerProvider } from "./state/DrawerContext";
import { RollProvider } from "./state/RollContext";
import { WizardProvider } from "./state/WizardContext";
import { BattleActionsProvider } from "./state/BattleActionsContext";
import { GlossaryTipProvider } from "./state/GlossaryTipContext";

// The app's provider composition, shared by main.tsx and provider-integration
// tests. GlossaryTipProvider sits ABOVE DrawerProvider and WizardProvider so the
// glossary terms rendered inside their portalled overlays (drawers, wizards) can
// resolve useGlossaryTip — a portal inherits context from where it is created in
// the React tree, not from where it mounts in the DOM.
//
// BattleActionsProvider must sit ABOVE WizardProvider: WizardProvider portals the
// AttackWizard, which calls useBattleActions(). A portal reads context from where
// it is created in the tree, so the wizard needs BattleActionsProvider as an
// ancestor of WizardProvider. (BattleActionsProvider never uses useWizard, so the
// dependency only runs one way.)
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <RoomProvider>
      <GlossaryTipProvider>
        <UiProvider>
          <DrawerProvider>
            <RollProvider>
              <BattleActionsProvider>
                <WizardProvider>{children}</WizardProvider>
              </BattleActionsProvider>
            </RollProvider>
          </DrawerProvider>
        </UiProvider>
      </GlossaryTipProvider>
    </RoomProvider>
  );
}
