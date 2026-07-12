import type { ReactNode } from "react";
import { RoomProvider } from "../../state/RoomStateContext";
import { ImpersonationProvider } from "./ImpersonationContext";
import { V2GlossaryTipProvider } from "./V2GlossaryTipContext";
import { UiProvider } from "../../state/UiStateContext";
import { V2DrawerProvider } from "./V2DrawerContext";
import { V2RollProvider } from "./V2RollContext";
import { V2BattleActionsProvider } from "./V2BattleActionsContext";
import { V2WizardProvider } from "./V2WizardContext";

// V2's own provider stack — it never mounts the V1 overlay providers. Pure Room/Ui
// state is reused; every overlay (GlossaryTip/Drawer/Roll/BattleActions/Wizard) is
// native V2. Order matters: V2WizardProvider portals AttackWizard, which calls
// useV2BattleActions, so BattleActions must be its ancestor (mirrors AppProviders).
export function V2Providers({ children }: { children: ReactNode }) {
  return (
    <RoomProvider>
      <ImpersonationProvider>
        <V2GlossaryTipProvider>
          <UiProvider>
            <V2DrawerProvider>
              <V2RollProvider>
                <V2BattleActionsProvider>
                  <V2WizardProvider>{children}</V2WizardProvider>
                </V2BattleActionsProvider>
              </V2RollProvider>
            </V2DrawerProvider>
          </UiProvider>
        </V2GlossaryTipProvider>
      </ImpersonationProvider>
    </RoomProvider>
  );
}
