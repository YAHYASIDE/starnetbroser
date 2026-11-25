import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { AppLockGate } from "@/components/AppLockGate";
import { ActivationGate } from "@/components/ActivationGate";
import { RepModeGate } from "@/components/RepModeGate";
import { StorageFullBanner } from "@/components/StorageFullBanner";
import { RepOpFlagsBanner } from "@/components/RepOpFlagsBanner";
import { WhatsAppSuggestionsBadge } from "@/components/WhatsAppSuggestionsBadge";
import { PortalRequestsBadge, PortalRunner } from "@/components/PortalLink";
import { RepFlagRunner, RepFlagsBanner } from "@/components/RepFlagsBanner";
import { TelegramBridge } from "@/components/TelegramBridge";
import { DataReloadBoundary } from "@/components/DataReloadBoundary";
import { RouteRepair } from "@/components/RouteRepair";
import { BrowserActionsRunner } from "@/components/BrowserActionsRunner";
import { ChatRunner } from "@/components/ChatRunner";
import { WhatsAppRunner } from "@/components/WhatsAppRunner";
import { WaCloudRunner } from "@/components/WaCloudRunner";
import { CallManager } from "@/components/CallManager";
import { DesktopFocusFix } from "@/components/DesktopFocusFix";
import { ReceiptReaderRunner } from "@/components/ReceiptReaderRunner";
import { PhoneShortcutLayer } from "@/components/PhoneShortcutLayer";
import { DeleteCodeHost } from "@/components/DeleteCodePrompt";
import { LatinDigitInputs } from "@/components/LatinDigitInputs";
import { WhatsNewTour } from "@/components/WhatsNewTour";
import { LiveSyncRunner } from "@/components/LiveSyncRunner";
import { DeviceLinkRunner } from "@/components/DeviceLinkRunner";
import { TeamSyncLine } from "@/components/TeamSyncLine";
import { RepCopyAutoRunner } from "@/components/RepCopyAutoRunner";
import { RepAutoStatementRunner } from "@/components/RepAutoStatementRunner";
import { LinkGuardListener } from "@/components/LinkGuardListener";
import { DeskSidebar, DeskKeys } from "@/components/DeskSidebar";
import { LaunchSplash } from "@/components/LaunchSplash";
import { BigStorageGate } from "@/components/BigStorageGate";
import { BackgroundPart, SafeModeBanner } from "@/components/SafeMode";
import { SAFE_MODE_BOOT_SCRIPT } from "@/lib/safeMode";

export const metadata: Metadata = {
  title: "STAR NET",
  description: "إدارة حسابات وأجهزة Starlink",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#060A14",
};

// Applies a saved manual light/dark choice (settingsStore.ts's "starnet.theme") before first
// paint, so there's no flash of the wrong theme while React hydrates - kept in sync with
// applyThemePreference's own logic, duplicated here only because this must run as plain JS
// before any module import.
// 🖥️ The Windows app (its preload's bridge is there before any page script) gets the laptop
// layout - html.desk, see "Windows layout" in globals.css - before first paint too.
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("starnet.theme");document.documentElement.setAttribute("data-theme",t==="light"||t==="system"?t:"dark");}catch(e){document.documentElement.setAttribute("data-theme","dark");}try{if(window.starnetDesktop){document.documentElement.classList.add("desk");if(localStorage.getItem("starnet.deskSidebar")==="collapsed")document.documentElement.classList.add("desk-collapsed");}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the inline theme script sets data-theme on <html> before React
    // hydrates (to avoid a flash of the wrong theme), which React would otherwise flag.
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* 🛟 counts the opens before anything else runs - 3 in 3 minutes = the safe mode (lib/safeMode.ts) */}
        <script dangerouslySetInnerHTML={{ __html: SAFE_MODE_BOOT_SCRIPT }} />
        {/* 🌌 the opening screen - first in the page, dark from the very first frame */}
        <LaunchSplash />
        {/* 🗄️ the data is loaded from IndexedDB (moved there once) before anything reads it - lib/bigStorage.ts */}
        <BigStorageGate>
        {/* 🔐 nothing runs on a phone that wasn't activated with his code - not even the bridges below. */}
        <ActivationGate>
        <AppLockGate>
          <RepModeGate>
            <DataReloadBoundary>{children}</DataReloadBoundary>
            <RouteRepair />
            <BottomNav />
            <DeskSidebar />
            <DeskKeys />
            <WhatsNewTour />
            <SafeModeBanner />
            <BackgroundPart part="link">
              <LiveSyncRunner />
              <DeviceLinkRunner />
              <TeamSyncLine />
              <PortalRunner />
            </BackgroundPart>
            <BackgroundPart part="reps">
              <RepCopyAutoRunner />
              <RepAutoStatementRunner />
            </BackgroundPart>
            <BackgroundPart part="whatsapp">
              <WhatsAppRunner />
              <WaCloudRunner />
            </BackgroundPart>
            <RepOpFlagsBanner />
            <WhatsAppSuggestionsBadge />
            <PortalRequestsBadge />
            <RepFlagsBanner />
            <BackgroundPart part="reps">
              <RepFlagRunner />
            </BackgroundPart>
            <LinkGuardListener />
          </RepModeGate>
        </AppLockGate>
        <BackgroundPart part="telegram">
          <TelegramBridge />
        </BackgroundPart>
        <DesktopFocusFix />
        <BackgroundPart part="receipts">
          <ReceiptReaderRunner />
        </BackgroundPart>
        <BackgroundPart part="browser">
          <BrowserActionsRunner />
        </BackgroundPart>
        <BackgroundPart part="chat">
          <ChatRunner />
          <CallManager />
        </BackgroundPart>
        <PhoneShortcutLayer />
        <StorageFullBanner />
        <DeleteCodeHost />
        <LatinDigitInputs />
        </ActivationGate>
        </BigStorageGate>
      </body>
    </html>
  );
}
