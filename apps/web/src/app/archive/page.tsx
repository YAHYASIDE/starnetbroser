import { HomeView } from "@/components/HomeView";
import { demoAccounts } from "@/lib/demoData";

export default function ArchivePage() {
  return <HomeView accounts={demoAccounts} viewMode="archived" />;
}
