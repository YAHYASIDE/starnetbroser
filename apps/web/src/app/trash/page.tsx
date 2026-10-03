import { HomeView } from "@/components/HomeView";
import { demoAccounts } from "@/lib/demoData";

export default function TrashPage() {
  return <HomeView accounts={demoAccounts} viewMode="trash" />;
}
