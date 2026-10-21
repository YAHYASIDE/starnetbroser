import { HomeView } from "@/components/HomeView";
import { demoAccounts } from "@/lib/demoData";

/** 🖥️ The Windows app's devices table (on the phone it is the same list as the home page). */
export default function DevicesPage() {
  return <HomeView accounts={demoAccounts} deskPage="devices" />;
}
